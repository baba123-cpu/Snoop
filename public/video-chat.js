const socket = io();
let localStream;
let peerConnection;
let roomId;

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

document.addEventListener('DOMContentLoaded', () => {
  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');
  const reportButton = document.getElementById('report-button');

  // Access the user's camera & microphone
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      localStream = stream;
      localVideo.srcObject = stream;
      // Join video chat after getting media
      socket.emit('join-video-chat');
    })
    .catch(error => console.error('Error accessing media devices.', error));

  socket.on('joined-room', (id) => {
    roomId = id;
    console.log(`Joined room: ${roomId}`);
  });

  socket.on('video-chat-started', () => {
    createPeerConnection(remoteVideo);

    // Create and send an offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => socket.emit('offer', peerConnection.localDescription, roomId))
      .catch(error => console.error('Error creating offer.', error));
  });

  socket.on('offer', (offer) => {
    createPeerConnection(remoteVideo);

    peerConnection.setRemoteDescription(offer)
      .then(() => peerConnection.createAnswer())
      .then(answer => peerConnection.setLocalDescription(answer))
      .then(() => socket.emit('answer', peerConnection.localDescription, roomId))
      .catch(error => console.error('Error handling offer.', error));
  });

  socket.on('answer', (answer) => {
    peerConnection.setRemoteDescription(answer)
      .catch(error => console.error('Error handling answer.', error));
  });

  socket.on('ice-candidate', (candidate) => {
    peerConnection.addIceCandidate(candidate)
      .catch(error => console.error('Error adding ICE candidate.', error));
  });

  // Report button event listener
  reportButton.addEventListener('click', () => {
    if (roomId) {
      socket.emit('report', roomId);
      console.log('Reported room:', roomId);
    }
  });
});

/**
 * Creates a new RTCPeerConnection, adds local stream tracks,
 * and sets up event handlers for remote tracks and ICE candidates.
 */
function createPeerConnection(remoteVideo) {
  peerConnection = new RTCPeerConnection(configuration);

  // Add local stream tracks to the connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // When remote track is received, display it
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Handle ICE candidates and forward them to the peer
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate, roomId);
    }
  };
}
