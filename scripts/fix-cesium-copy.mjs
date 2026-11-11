// vite-plugin-cesium 会把 base 拼进文件拷贝路径:非根 base(如 /lxhhj-demo/)部署时,
// cesium 静态资源被拷到 dist/<base>/cesium,而页面引用的 /<base>/cesium 实际对应 dist/cesium。
// 本脚本在 vite build 之后执行,把拷错的目录移回正确位置。
import fs from 'fs';
import path from 'path';

const wrong = path.resolve('dist/lxhhj-demo/cesium');
const right = path.resolve('dist/cesium');

if (fs.existsSync(wrong)) {
    fs.rmSync(right, {recursive: true, force: true});
    fs.renameSync(wrong, right);
    fs.rmdirSync(path.resolve('dist/lxhhj-demo'));
    console.log('[fix-cesium-copy] dist/lxhhj-demo/cesium -> dist/cesium');
} else {
    console.log('[fix-cesium-copy] no misplaced cesium dir, skip');
}
