const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 300;

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Object to store rooms and their users, along with the waiting user's gender
const rooms = {};

// Global counter for female users
let femaleCount = 0;

/**
 * Helper function to find an available room for a new text chat user
 * based on gender matching rules:
 *  - A male user only connects with a waiting female.
 *  - A female user only connects with a waiting male.
 *  - A user with "other" gender connects with any waiting user.
 *  - Exception: if both the waiting and new user are female and femaleCount > 500, allow matching.
 *  - If newUserGender is 'any', no matching condition is met, so a new room will be created.
 */
function findAvailableRoomForGender(newUserGender) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    // Consider only rooms with one waiting user.
    if (room.users.length === 1) {
      const waitingGender = room.gender;
      console.log(`Checking room ${roomId}: waitingGender=${waitingGender}, newUserGender=${newUserGender}`);
      
      // Male new user: match only with waiting female.
      if (newUserGender === 'male' && waitingGender === 'female') {
        console.log(`Matching male user with room ${roomId} (waiting female).`);
        return roomId;
      }
      
      // Female new user: match only with waiting male.
      if (newUserGender === 'female') {
        if (waitingGender === 'male') {
          console.log(`Matching female user with room ${roomId} (waiting male).`);
          return roomId;
        }
        // Exception: if waiting user is also female and femaleCount > 500, allow matching.
        if (waitingGender === 'female' && femaleCount > 500) {
          console.log(`Matching female user with room ${roomId} (waiting female, femaleCount > 500).`);
          return roomId;
        }
      }
      
      // Other gender: match with any waiting user.
      if (newUserGender === 'other') {
        console.log(`Matching 'other' gender user with room ${roomId}.`);
        return roomId;
      }
    }
  }
  return null;
}

// Handle socket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ---------------------------------------------------------------------------
  // TEXT CHAT EVENTS WITH GENDER FILTERING
  // ---------------------------------------------------------------------------
  // Expect the client to emit 'join-text-chat' with an object like { gender: 'male' }.
  socket.on('join-text-chat', (data) => {
    const userGender = data && data.gender ? data.gender : 'any';
    socket.gender = userGender;
    console.log(`Socket ${socket.id} join-text-chat with gender: ${userGender}`);

    // If the user is female, increment the global female count.
    if (userGender === 'female') {
      femaleCount++;
      console.log(`Female count incremented: ${femaleCount}`);
    }

    // Find an available room for matching.
    let roomId = findAvailableRoomForGender(userGender);
    if (!roomId) {
      // No matching room found; create a new room.
      roomId = `room-${Date.now()}`;
      rooms[roomId] = { users: [], gender: userGender };
      console.log(`Created new room ${roomId} with gender ${userGender}`);
    }

    // Add the user to the room.
    rooms[roomId].users.push(socket.id);
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    // If only one user is in the room, notify that they're waiting.
    if (rooms[roomId].users.length === 1) {
      io.to(roomId).emit('waiting-for-stranger');
      console.log(`Room ${roomId} has one user; emitting waiting-for-stranger`);
    }

    // If the room now has two users, emit chat-started.
    if (rooms[roomId].users.length === 2) {
      io.to(roomId).emit('chat-started');
      console.log(`Room ${roomId} now has two users; emitting chat-started`);
    }

    // Send the room ID back to the client.
    socket.emit('joined-room', roomId);
  });

  // Relay text chat messages to the other user in the room.
  socket.on('send-message', (message, roomId) => {
    socket.broadcast.to(roomId).emit('receive-message', message);
  });

  // ---------------------------------------------------------------------------
  // VIDEO CHAT EVENTS (if needed)
  // ---------------------------------------------------------------------------
  socket.on('join-video-chat', () => {
    let roomId = findAvailableRoomForGender('any'); // For video chat, ignore gender matching.
    if (!roomId) {
      roomId = `room-${Date.now()}`;
      rooms[roomId] = { users: [], gender: 'any' };
    }
    rooms[roomId].users.push(socket.id);
    socket.join(roomId);
    socket.emit('joined-room', roomId);
    if (rooms[roomId].users.length === 2) {
      io.to(roomId).emit('video-chat-started');
    }
  });

  socket.on('offer', (offer, roomId) => {
    socket.to(roomId).emit('offer', offer);
  });

  socket.on('answer', (answer, roomId) => {
    socket.to(roomId).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate, roomId) => {
    socket.to(roomId).emit('ice-candidate', candidate);
  });

  // ---------------------------------------------------------------------------
  // REPORT EVENT
  // ---------------------------------------------------------------------------
  socket.on('report', (data) => {
    console.log(`Report received for room: ${data.roomId}, Reason: ${data.reason}`);
    // TODO: Add logic to handle repeated reports, warnings, etc.
  });

  // ---------------------------------------------------------------------------
  // DISCONNECT EVENT
  // ---------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const index = rooms[roomId].users.indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].users.splice(index, 1);
        if (socket.gender === 'female') {
          femaleCount--;
          console.log(`Female count decremented: ${femaleCount}`);
        }
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
          console.log(`Deleted room ${roomId} as it is now empty.`);
        } else {
          io.to(roomId).emit('user-disconnected');
          console.log(`Room ${roomId} still has users; emitted user-disconnected.`);
        }
      }
    }
  });
});

// Start the server and listen on the specified port.
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
