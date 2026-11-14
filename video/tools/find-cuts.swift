import AVFoundation
import CoreGraphics

let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let reader = try! AVAssetReader(asset: asset)
let track = asset.tracks(withMediaType: .video).first!
let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out); reader.startReading()
var prev: [Double]? = nil
var results: [(Double, Double)] = []
while let sb = out.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var cur: [Double] = []
    let gx = 32, gy = 18
    for j in 0..<gy { for i in 0..<gx {
        let x = (i * w) / gx + w / (2 * gx), y = (j * h) / gy + h / (2 * gy)
        let p = base + y * bpr + x * 4
        let lum: Double = 0.114 * Double(p[0]) + 0.587 * Double(p[1]) + 0.299 * Double(p[2])
        cur.append(lum)
    } }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    if let pv = prev {
        var d: Double = 0
        for k in 0..<cur.count { d += abs(cur[k] - pv[k]) }
        results.append((t, d / Double(cur.count)))
    }
    prev = cur
}
for (t, d) in results where d > 6 { print(String(format: "%.3f  diff=%.1f", t, d)) }
