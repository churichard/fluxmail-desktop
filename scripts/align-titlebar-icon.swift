#!/usr/bin/env swift

import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: align-titlebar-icon.swift <iconset-directory>\n", stderr)
  exit(1)
}

let iconsetURL = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let titlebarRepresentations = [
  ("icon_16x16.png", 1),
  ("icon_16x16@2x.png", 2),
]

for (name, downwardOffset) in titlebarRepresentations {
  let iconURL = iconsetURL.appendingPathComponent(name)
  guard
    let sourceData = try? Data(contentsOf: iconURL),
    let source = NSBitmapImageRep(data: sourceData),
    let output = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: source.pixelsWide,
      pixelsHigh: source.pixelsHigh,
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let context = NSGraphicsContext(bitmapImageRep: output)
  else {
    fputs("Could not prepare \(iconURL.path)\n", stderr)
    exit(1)
  }

  let image = NSImage(
    size: NSSize(width: source.pixelsWide, height: source.pixelsHigh)
  )
  image.addRepresentation(source)

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = NSImageInterpolation.none
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: output.pixelsWide, height: output.pixelsHigh).fill()
  image.draw(
    in: NSRect(
      x: 0,
      y: -downwardOffset,
      width: source.pixelsWide,
      height: source.pixelsHigh
    ),
    from: NSRect.zero,
    operation: NSCompositingOperation.copy,
    fraction: 1
  )
  NSGraphicsContext.restoreGraphicsState()

  guard
    let data = output.representation(
      using: NSBitmapImageRep.FileType.png,
      properties: [:]
    )
  else {
    fputs("Could not encode \(iconURL.path)\n", stderr)
    exit(1)
  }
  try data.write(to: iconURL)
}
