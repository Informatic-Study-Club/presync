import "server-only";
import bwipjs from "bwip-js/node";
import type { CardBarcode } from "./token";

// Barcode dibuat lokal, tidak lewat situs pihak ketiga (keputusan #11).

function options(barcode: CardBarcode) {
  return barcode.symbology === "code128"
    ? { bcid: "code128", text: barcode.text, scale: 3, height: 12, includetext: false }
    : { bcid: "qrcode", text: barcode.text, scale: 4, eclevel: "M" };
}

export function barcodeSvg(barcode: CardBarcode): string {
  return bwipjs.toSVG(options(barcode));
}

export function barcodePng(barcode: CardBarcode): Promise<Buffer> {
  return bwipjs.toBuffer(options(barcode));
}
