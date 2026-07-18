#!/usr/bin/env swift

import AppKit
import Foundation

let canvasWidth = 658.0
let canvasHeight = 498.0
let scriptURL = URL(fileURLWithPath: #filePath)
let rootURL = scriptURL.deletingLastPathComponent().deletingLastPathComponent()

func color(_ red: Int, _ green: Int, _ blue: Int, alpha: Double = 1) -> NSColor {
  NSColor(
    calibratedRed: Double(red) / 255,
    green: Double(green) / 255,
    blue: Double(blue) / 255,
    alpha: alpha
  )
}

func render(scale: Double, outputName: String) throws {
  let width = Int(canvasWidth * scale)
  let height = Int(canvasHeight * scale)
  guard
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: width,
      pixelsHigh: height,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let context = NSGraphicsContext(bitmapImageRep: bitmap)
  else {
    throw NSError(domain: "FluxmailDMGBackground", code: 1)
  }

  func rect(x: Double, y: Double, width: Double, height: Double) -> NSRect {
    NSRect(
      x: x * scale,
      y: (canvasHeight - y - height) * scale,
      width: width * scale,
      height: height * scale
    )
  }

  func point(x: Double, y: Double) -> NSPoint {
    NSPoint(x: x * scale, y: (canvasHeight - y) * scale)
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.shouldAntialias = true
  context.imageInterpolation = .high

  let canvas = NSRect(x: 0, y: 0, width: Double(width), height: Double(height))
  let background = NSGradient(
    starting: color(240, 245, 255),
    ending: color(218, 229, 250)
  )
  background?.draw(in: canvas, angle: 305)

  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = color(34, 58, 116, alpha: 0.14)
  shadow.shadowBlurRadius = 24 * scale
  shadow.shadowOffset = NSSize(width: 0, height: -8 * scale)
  shadow.set()
  color(255, 255, 255, alpha: 0.58).setFill()
  NSBezierPath(
    roundedRect: rect(x: 54, y: 137, width: 550, height: 224),
    xRadius: 28 * scale,
    yRadius: 28 * scale
  ).fill()
  NSGraphicsContext.restoreGraphicsState()

  color(255, 255, 255, alpha: 0.72).setStroke()
  let cardBorder = NSBezierPath(
    roundedRect: rect(x: 54, y: 137, width: 550, height: 224),
    xRadius: 28 * scale,
    yRadius: 28 * scale
  )
  cardBorder.lineWidth = scale
  cardBorder.stroke()

  let arrow = NSBezierPath()
  arrow.move(to: point(x: 286, y: 233))
  arrow.line(to: point(x: 371, y: 233))
  arrow.move(to: point(x: 350, y: 212))
  arrow.line(to: point(x: 371, y: 233))
  arrow.line(to: point(x: 350, y: 254))
  arrow.lineWidth = 8 * scale
  arrow.lineCapStyle = .round
  arrow.lineJoinStyle = .round
  color(43, 87, 209, alpha: 0.88).setStroke()
  arrow.stroke()

  NSGraphicsContext.restoreGraphicsState()

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "FluxmailDMGBackground", code: 2)
  }
  try data.write(to: rootURL.appendingPathComponent("build/\(outputName)"))
}

try render(scale: 1, outputName: "dmg-background.png")
try render(scale: 2, outputName: "dmg-background@2x.png")
