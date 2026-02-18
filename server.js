const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.static("public"))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*"
  }
})

io.on("connection", (socket) => {
  console.log("User connected")

  socket.on("chat message", (data) => {
    io.emit("chat message", data)
  })
})

const PORT = process.env.PORT || 3000

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`)
})
