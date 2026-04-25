const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")

const root = __dirname
const port = Number(process.env.PORT || 5188)

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
}

http.createServer((request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0]
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "")
  const filePath = path.join(root, safePath)

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      response.end("Not found")
      return
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    })
    response.end(data)
  })
}).listen(port, "0.0.0.0", () => {
  console.log(`FB_8MB ready at http://localhost:${port}/`)
})
