// Per frame: table back-left corner (intersection of back edge and left side) and shelf post x.
// Prints: f cornerX cornerY postX60 postX400
import AVFoundation

let a = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let g = AVAssetImageGenerator(asset: a)
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
for s in CommandLine.arguments.dropFirst(2) { autoreleasepool {
    let f = Int(s)!
    let cg = try! g.copyCGImage(at: CMTime(value: CMTimeValue(f), timescale: 24), actualTime: nil)
    let W = cg.width, H = cg.height
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    let p = ctx.data!.assumingMemoryBound(to: UInt8.self)
    func B(_ x: Int, _ y: Int) -> Int { Int(p[(y * W + x) * 4 + 2]) }
    func R(_ x: Int, _ y: Int) -> Int { Int(p[(y * W + x) * 4]) }
    func isTable(_ x: Int, _ y: Int) -> Bool { (0..<3).allSatisfy { B(x, y + $0) >= 228 } }
    // back edge y at a column: first table row scanning down from 300
    func backY(_ x: Int) -> Double {
        for y in 300..<(H - 4) where isTable(x, y) { return Double(y) }
        return -1
    }
    // left side x at a row: first table pixel scanning right
    func sideX(_ y: Int) -> Double {
        for x in 0..<(W / 2) where (0..<3).allSatisfy({ B(x + $0, y) >= 228 }) { return Double(x) }
        return -1
    }
    let y1 = backY(400), y2 = backY(560)
    let slope = (y2 - y1) / 160.0 // back edge: y = y1 + slope*(x-400)
    let r1 = Int(max(y1, y2)) + 60, r2 = Int(max(y1, y2)) + 160
    let x1 = sideX(r1), x2 = sideX(r2)
    // left side: x = x1 + k*(y - r1)
    let k = (x2 - x1) / Double(r2 - r1)
    // intersect
    let cy = (y1 + slope * (x1 - Double(r1) * k - 400)) / (1 - slope * k)
    let cx = x1 + k * (cy - Double(r1))
    func post(_ row: Int) -> Int {
        for x in 1250..<(W - 3) where (0..<3).allSatisfy({ R(x + $0, row) < 200 && abs(R(x + $0, row) - B(x + $0, row)) < 30 }) { return x }
        return -1
    }
    print(String(format: "%d %.1f %.1f %d %d", f, cx, cy, post(60), post(400)))
} }
