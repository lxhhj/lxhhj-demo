import * as Cesium from "cesium";
import iconTypes from "@/views/cesium/cesiumMap/iconTypes";

/** extract.json 单时刻序列项: t=数据相对秒(与主图层 setTime 同口径), Z=水位(m), H=水深(m), Vel=流速(m/s); 无水时刻值为 null */
export interface ExtractSeriesItem {
    t: number;
    Z: number | null;
    H: number | null;
    Vel: number | null;
}

/** extract.json 单个水位站点(points 数组项) */
export interface ExtractPoint {
    id: string;
    name: string;
    type: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    /** WGS84 经纬度 [lon, lat] */
    wgs84: { type: "Point"; coordinates: [number, number] };
    grid: { col: number; row: number };
    series: ExtractSeriesItem[];
    peak?: { Z_max: number; t_Zmax: number; H_max: number; t_Hmax: number };
}

export interface ExtractStationsOptions {
    viewer: Cesium.Viewer;
    /** 工况名(如 "0.5P"), 模型数据根 = GISDATA/jz/model/<dataDir>/ */
    dataDir: string;
    /** 地图模式(2d/3d), 决定站点图标与尺寸 */
    mapType?: "2d" | "3d";
}

/**
 * 水位站点图层: 读取模型目录下 extract.json 的 points.series, 加载水位站图标 + 站名 + 实时水位标注.
 * 站点 Entity(billboard/label)参考 cesiumLast 测站(reservoirStation)模式;
 * 实时值按 series 相邻样本线性插值, 经 setTime(数据相对秒)随时间轴刷新.
 */
export class ExtractStations {
    viewer: Cesium.Viewer;
    /** 已加载的站点列表(extract.json points) */
    points: ExtractPoint[] = [];
    private base = "";
    private mapType: "2d" | "3d";
    private ds: Cesium.CustomDataSource;
    /** 实时水位标注实体(与 points 顺序对应), setTime 时更新 text */
    private valueLabels: Cesium.Entity[] = [];
    /** 每站 series 游标(播放/回拖只需移动相邻区间, 避免每次全表扫描) */
    private cursors: { i: number }[] = [];
    private destroyed = false;

    constructor(opts: ExtractStationsOptions) {
        this.viewer = opts.viewer;
        this.mapType = opts.mapType ?? "3d";
        // 模型数据根 = GISDATA/jz/model/<工况名>/, 与 TimeSeriesLayer/ParticleFlowLayer 一致
        this.base = `${import.meta.env.VITE_APP_GISDATA}/jz/model/${opts.dataDir}/`;
        this.ds = new Cesium.CustomDataSource("extractStations");
        this.viewer.dataSources.add(this.ds);
    }

    static async create(opts: ExtractStationsOptions): Promise<ExtractStations> {
        const layer = new ExtractStations(opts);
        try {
            const resp = await fetch(`${layer.base}extract.json`);
            if (!resp.ok) throw new Error(`fetch extract.json -> ${resp.status}`);
            const json = await resp.json();
            layer.addPoints(json.points || []);
        } catch (e) {
            layer.destroy(); // 加载失败: 先摘除已挂到 viewer 的 datasource 再抛出
            throw e;
        }
        return layer;
    }

    /** 站点 Entity: 水位站图标 + 站名(图标下方) + 实时水位标注(图标上方) */
    private addPoints(points: ExtractPoint[]) {
        this.points = points;
        points.forEach((item, i) => {
            const [lon, lat] = item.wgs84.coordinates;
            const position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
            const common = {
                // 贴地且不参与深度测试, 保证地形/倾斜摄影之上始终可见
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            };
            this.ds.entities.add({
                id: `extractStation-${i}`,
                customType: "extractStation",
                data: item,
                position,
                billboard: {
                    image: iconTypes["wzReservoir"]["2d"][1],
                    scale: 0.4,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.0, 8.0e6, 0.2),
                    ...common,
                },
                // label: { // 站名(图标下方)
                //     text: item.name,
                //     font: "14px PingFangSC-Regular, PingFang SC",
                //     style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                //     pixelOffset: new Cesium.Cartesian2(0, 15),
                //     outlineColor: Cesium.Color.fromCssColorString("black"),
                //     horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                //     verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                //     fillColor: Cesium.Color.fromCssColorString("#fff"),
                //     ...common,
                // },
            });
            this.valueLabels.push(this.ds.entities.add({
                id: `extractStation-value-${i}`,
                position,
                label: { // 实时水位(图标上方), text 由 setTime 刷新
                    text: "--",
                    font: "13px PingFangSC-Regular, PingFang SC",
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, -24),
                    outlineColor: Cesium.Color.fromCssColorString("black"),
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    fillColor: Cesium.Color.WHITE,
                    showBackground: true,
                    backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 40, 80, 0.7)'),
                    backgroundPadding: new Cesium.Cartesian2(6, 4),
                    ...common,
                },
            }));
            this.cursors.push({i: 0});
        });
    }

    /** 时间轴刷新: 逐站取 t 时刻水位(series 线性插值), 更新实时值标注 */
    setTime(t: number) {
        if (this.destroyed) return;
        this.valueLabels.forEach((entity, i) => {
            const v = this.sampleZ(this.points[i].series, t, this.cursors[i]);
            entity.label!.text = v == null ? "--" : `${v.toFixed(2)} m`;
        });
    }

    /** t 时刻水位: 游标定位相邻样本线性插值; 两端钳制, 样本 null(无水)取非空一侧 */
    private sampleZ(series: ExtractSeriesItem[], t: number, cursor: { i: number }): number | null {
        const n = series.length;
        if (!n) return null;
        if (t <= series[0].t) {
            cursor.i = 0;
            return series[0].Z;
        }
        if (t >= series[n - 1].t) {
            cursor.i = n - 1;
            return series[n - 1].Z;
        }
        let i = Math.min(Math.max(cursor.i, 0), n - 2);
        while (i > 0 && series[i].t > t) i--;           // 时间回退(进度条往回拖)
        while (i < n - 2 && series[i + 1].t <= t) i++;  // 时间前进
        cursor.i = i;
        const a = series[i], b = series[i + 1];
        if (a.Z == null || b.Z == null) return a.Z ?? b.Z; // 干湿边界: 取非空一侧
        return a.Z + (b.Z - a.Z) * ((t - a.t) / (b.t - a.t));
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.valueLabels = [];
        this.viewer.dataSources.remove(this.ds); // remove 同时销毁 datasource 与其中实体
    }
}
