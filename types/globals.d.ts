// Type stubs for the CDN-loaded vendors (see slidershow/slidershow.js).
// Only editor IntelliSense / `checkJs` uses this file; nothing loads it at runtime.

import * as Leaflet from "leaflet"

declare global {
    const L: typeof Leaflet

    class WebHotkeys {
        constructor(...args: any[])
        grab(shortcut: string, hint: string, method: Function, ...args: any[]): any
        group(name: string, definitions: any[]): any
        getText(): string
        [key: string]: any
    }

    const EXIF: {
        getData(el: any, callback: () => void): void
        getTag(el: any, tag: string): any
        [key: string]: any
    }

    const showdown: any
    const WZoom: any
    function textFit(els: any, options?: any): void

    interface JQuery {
        circleProgress(...args: any[]): JQuery
        [key: string]: any
    }

    interface JQueryStatic {
        Zebra_Dialog: any
    }
}

export {}
