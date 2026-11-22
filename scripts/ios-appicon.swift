#!/usr/bin/env swift
// Regenera AppIcon.png (1024x1024, sin alfa) desde el icono adaptativo de Android: primer plano VectorDrawable y color
// de fondo. Se corre a mano cuando cambia el icono de Android; el PNG sí se versiona.
//   swift scripts/ios-appicon.swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().path
let res = "\(root)/apps/android/customer/src/main/res"
let a = [
    "", "\(res)/drawable/ic_launcher_foreground.xml", "\(res)/values/ic_launcher_background.xml",
    "\(root)/apps/ios/TindivoCustomer/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
]
let fg = try! String(contentsOfFile: a[1], encoding: .utf8)
let bg = try! String(contentsOfFile: a[2], encoding: .utf8)

func capture(_ pattern: String, in text: String) -> String {
    let re = try! NSRegularExpression(pattern: pattern)
    let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))!
    return String(text[Range(m.range(at: 1), in: text)!])
}
func hex(_ s: String) -> CGColor {
    let v = UInt32(s.dropFirst(), radix: 16)!
    let h = s.count == 9 ? v & 0xFFFFFF : v // #AARRGGBB -> se ignora alfa
    return CGColor(srgbRed: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: 1)
}

let viewport = CGFloat(Double(capture("viewportWidth=\"([0-9.]+)\"", in: fg))!)
let pathData = capture("pathData=\"([^\"]+)\"", in: fg)
let fill = hex(capture("fillColor=\"(#[0-9A-Fa-f]+)\"", in: fg))
let background = hex(capture(">(#[0-9A-Fa-f]+)<", in: bg))

// Path SVG mínimo: M m L l H h V v Z z (lo que usa el recurso).
let path = CGMutablePath()
var tokens: [String] = []
var cur = ""
for ch in pathData {
    if ch.isLetter { if !cur.isEmpty { tokens.append(cur); cur = "" }; tokens.append(String(ch)) }
    else if ch == "," || ch == " " { if !cur.isEmpty { tokens.append(cur); cur = "" } }
    else if ch == "-" { if !cur.isEmpty { tokens.append(cur) }; cur = "-" }
    else { cur.append(ch) }
}
if !cur.isEmpty { tokens.append(cur) }
var i = 0
var p = CGPoint.zero
var start = CGPoint.zero
var cmd = ""
func num() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i])!) }
while i < tokens.count {
    if tokens[i].first!.isLetter { cmd = tokens[i]; i += 1; if cmd == "z" || cmd == "Z" { path.closeSubpath(); p = start; continue } }
    switch cmd {
    case "M": p = CGPoint(x: num(), y: num()); path.move(to: p); start = p; cmd = "L"
    case "m": p = CGPoint(x: p.x + num(), y: p.y + num()); path.move(to: p); start = p; cmd = "l"
    case "L": p = CGPoint(x: num(), y: num()); path.addLine(to: p)
    case "l": p = CGPoint(x: p.x + num(), y: p.y + num()); path.addLine(to: p)
    case "H": p.x = num(); path.addLine(to: p)
    case "h": p.x += num(); path.addLine(to: p)
    case "V": p.y = num(); path.addLine(to: p)
    case "v": p.y += num(); path.addLine(to: p)
    default: fatalError("comando no soportado: \(cmd)")
    }
}

let size = 1024
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(background)
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
// Ventana visible de un icono adaptativo: 72 de 108 dp, centrada. Se escala 1024/72 alrededor del centro.
let scale = CGFloat(size) / (viewport * 72 / 108)
ctx.translateBy(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
ctx.scaleBy(x: scale, y: -scale) // el eje Y de SVG/Android crece hacia abajo
ctx.translateBy(x: -viewport / 2, y: -viewport / 2)
ctx.setFillColor(fill)
ctx.addPath(path)
ctx.fillPath()
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
precondition(CGImageDestinationFinalize(dest))
