// Track the blank tablet screen (pure white, bounded by a black bezel) in each frame.
// Usage: swift track.swift <video> <out.json> <startFrame>-<endFrame> ...   (source frames @24fps)
import AVFoundation

let args = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
var ranges: [(Int, Int)] = []
for r in args.dropFirst(3) { let p = r.split(separator: "-").map { Int($0)! }; ranges.append((p[0], p[1])) }

let reader = try! AVAssetReader(asset: asset)
let track = asset.tracks(withMediaType: .video).first!
let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out); reader.startReading()

let S = 2 // downscale factor for the mask
var lines: [String] = []
var idx = -1
while let sb = out.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    idx = Int((CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb)) * 24).rounded())
    guard ranges.contains(where: { idx >= $0.0 && idx <= $0.1 }) else { continue }
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let W = CVPixelBufferGetWidth(pb), H = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    let w = W / S, h = H / S
    var mask = [Bool](repeating: false, count: w * h)
    for y in 0..<h { for x in 0..<w {
        let p = base + (y * S) * bpr + (x * S) * 4
        mask[y * w + x] = min(p[0], p[1]) >= 245
    } }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    // connected components, keep the largest one
    var label = [Int32](repeating: -1, count: w * h)
    var best: [Int] = []
    var stack: [Int] = []
    for s in 0..<(w * h) where mask[s] && label[s] < 0 {
        var comp: [Int] = []
        stack.append(s); label[s] = 1
        while let c = stack.popLast() {
            comp.append(c)
            let cx = c % w, cy = c / w
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let nx = cx + dx, ny = cy + dy
                if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
                let n = ny * w + nx
                if mask[n] && label[n] < 0 { label[n] = 1; stack.append(n) }
            }
        }
        if comp.count > best.count { best = comp }
    }
    if best.count < 800 { lines.append("{\"f\":\(idx),\"c\":null}"); continue }
    // extreme points: TL=min(x+y) TR=max(x-y) BR=max(x+y) BL=min(x-y)
    var tl = (Int.max, 0, 0), tr = (Int.min, 0, 0), br = (Int.min, 0, 0), bl = (Int.max, 0, 0)
    for c in best {
        let x = c % w, y = c / w
        if x + y < tl.0 { tl = (x + y, x, y) }
        if x + y > br.0 { br = (x + y, x, y) }
        if x - y > tr.0 { tr = (x - y, x, y) }
        if x - y < bl.0 { bl = (x - y, x, y) }
    }
    func P(_ t: (Int, Int, Int)) -> String { "[\(t.1 * S),\(t.2 * S)]" }
    lines.append("{\"f\":\(idx),\"area\":\(best.count * S * S),\"c\":[\(P(tl)),\(P(tr)),\(P(br)),\(P(bl))]}")
}
try! ("[\n" + lines.joined(separator: ",\n") + "\n]\n").write(toFile: args[2], atomically: true, encoding: .utf8)
print("frames tracked:", lines.count)
