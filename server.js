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

let users = []

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id)

  socket.on("join", (username) => {
    users.push({ id: socket.id, username })
    io.emit("chat message", {
      username: "System",
      message: `${username} prisijungė prie ChatX`
    })
  })

  socket.on("chat message", (data) => {
    io.emit("chat message", data)
  })

  socket.on("disconnect", () => {
    const user = users.find(u => u.id === socket.id)
    if (user) {
      io.emit("chat message", {
        username: "System",
        message: `${user.username} atsijungė`
      })
      users = users.filter(u => u.id !== socket.id)
    }
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`ChatX server running on port ${PORT}`)
})
