import {defineStore} from "pinia";

let ybTimer: number

/** yb-panl 时间轴共享状态(自 jz/web prolusion store 精简, 仅保留时间轴部分) */
export const useprolusionStore = defineStore({
    id: 'prolusionMap',
    state: () => ({
        ybTime: {
            curTime: 0,
            sliderTimeRang: [0, 0],
            playFlag: false,
            speedType: 1,
            timeOffset: 0,
            // 播放节奏(可按页面覆盖): 每 tick 推进的模型毫秒、1x 时每 tick 的真实毫秒
            advanceMs: 60 * 1e3,
            baseIntervalMs: 1000 / 60,
        },
    }),
    actions: {
        setYbTime(patch) {
            Object.assign(this.ybTime, patch)
        },
        resetYbTime(startTime, rangeHours) {
            this.stopYbPlay()
            this.ybTime.sliderTimeRang = [+startTime, +startTime + rangeHours * 60 * 60 * 1e3]
            this.ybTime.curTime = this.ybTime.sliderTimeRang[0]
        },
        toggleYbPlay() {
            this.ybTime.playFlag = !this.ybTime.playFlag
            if (this.ybTime.playFlag) {
                if (this.ybTime.curTime >= this.ybTime.sliderTimeRang[1]) this.ybTime.curTime = this.ybTime.sliderTimeRang[0]
                ybTimer = window.setInterval(() => {
                    if (this.ybTime.curTime >= this.ybTime.sliderTimeRang[1]) {
                        this.stopYbPlay()
                        return
                    }
                    this.ybTime.curTime = Math.min(this.ybTime.curTime + this.ybTime.advanceMs, this.ybTime.sliderTimeRang[1])
                }, this.ybTime.baseIntervalMs / this.ybTime.speedType)
            } else {
                window.clearInterval(ybTimer)
            }
        },
        stopYbPlay() {
            if (!this.ybTime.playFlag) return
            this.ybTime.playFlag = false
            window.clearInterval(ybTimer)
        },
    }
})
