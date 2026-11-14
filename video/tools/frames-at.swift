import AVFoundation
import AppKit
let a = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let g = AVAssetImageGenerator(asset: a); g.maximumSize = CGSize(width: 960, height: 540)
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
for s in CommandLine.arguments.dropFirst(3) {
  let cg = try! g.copyCGImage(at: CMTime(seconds: Double(s)!, preferredTimescale: 600), actualTime: nil)
  let d = NSBitmapImageRep(cgImage: cg).representation(using: .jpeg, properties: [:])!
  try! d.write(to: URL(fileURLWithPath: CommandLine.arguments[2] + "/t_" + s + ".jpg"))
}
