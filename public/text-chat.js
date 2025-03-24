// Create a Socket.IO client instance
const socket = io();

document.addEventListener('DOMContentLoaded', () => {
  // ============================================================================
  // 1) READ GENDER FROM URL
  // ============================================================================
  const urlParams = new URLSearchParams(window.location.search);
  const userGender = urlParams.get('gender') || 'any';
  console.log('User selected gender:', userGender);

  // ============================================================================
  // 2) DOM REFERENCES
  // ============================================================================
  const chatWindow = document.getElementById('chat-window');       // Chat messages container
  const messageInput = document.getElementById('message-input');     // Input for typing messages
  const sendButton = document.getElementById('send-button');         // Button to send message
  const reportButton = document.getElementById('report-button');     // Button to open the report modal
  const stopButton = document.getElementById('stop-button');         // Button to stop/disconnect chat
  const nextButton = document.getElementById('next-button');         // Button to start a new chat (reload page)

  // Modal elements for reporting inappropriate behavior
  const reportModal = document.getElementById('report-modal');       // Entire report modal container
  const reportForm = document.getElementById('report-form');         // The report form inside the modal
  const submitReportBtn = document.getElementById('submit-report');    // Submit button inside the report modal
  const cancelReportBtn = document.getElementById('cancel-report');    // Cancel button inside the report modal
  const otherTextInput = document.getElementById('other-text');        // Text input for "Other" reason

  // ============================================================================
  // 3) STATE VARIABLES
  // ============================================================================
  let roomId;                      // Stores the room identifier for the chat session
  let reportSubmitted = false;     // Flag to ensure the report is submitted only once

  // ============================================================================
  // 4) TIME-BASED COOLDOWN FOR SYSTEM MESSAGES
  // ============================================================================
  let lastSystemEventTime = 0;      // Timestamp of the last system message
  const COOLDOWN = 5000;            // Cooldown duration in milliseconds (5 seconds)

  // Function to append a system message if enough time has passed since the last one
  function appendSystemMessage(message) {
    const now = Date.now();
    if (now - lastSystemEventTime < COOLDOWN) {
      return;
    }
    lastSystemEventTime = now;
    appendMessage('System', message);
  }
  
  // Function to append a critical system message bypassing the cooldown.
  function appendCriticalSystemMessage(message) {
    lastSystemEventTime = Date.now();
    appendMessage('System', message);
  }

  // ============================================================================
  // 5) HELPER FUNCTION TO APPEND MESSAGES
  // ============================================================================
  function appendMessage(sender, text) {
    const msgElem = document.createElement('p');
    msgElem.textContent = `${sender}: ${text}`;
    chatWindow.appendChild(msgElem);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  // ============================================================================
  // 6) UI STATE FUNCTIONS: WAITING, CONNECTED, PARTNER DISCONNECTED
  // ============================================================================
  // Note: The Next button will now remain visible permanently.
  function setWaitingUI() {
    messageInput.disabled = true;
    messageInput.placeholder = 'Wait...';
    sendButton.disabled = true;

    reportButton.style.display = 'none';
    stopButton.style.display = 'none';
    nextButton.style.display = 'inline-block';  // Always visible
  }

  function setConnectedUI() {
    messageInput.disabled = false;
    messageInput.placeholder = 'Type a message...';
    sendButton.disabled = false;

    reportButton.style.display = 'inline-block';
    stopButton.style.display = 'inline-block';
    nextButton.style.display = 'inline-block';  // Always visible
  }
  
  function setPartnerDisconnectedUI() {
    messageInput.disabled = true;
    messageInput.placeholder = 'Stranger disconnected. Click Next to reconnect.';
    sendButton.disabled = true;

    reportButton.style.display = 'none';
    stopButton.style.display = 'none';
    nextButton.style.display = 'inline-block';  // Always visible
  }

  // Initially, user is alone → set waiting UI.
  setWaitingUI();

  // ============================================================================
  // 7) SOCKET LOGIC: JOINING THE CHAT ROOM AND HANDLING EVENTS
  // ============================================================================
  socket.emit('join-text-chat', { gender: userGender });

  socket.on('joined-room', (id) => {
    roomId = id;
    console.log(`Joined room: ${roomId}`);
  });

  socket.on('waiting-for-stranger', () => {
    appendSystemMessage('Waiting for a stranger...');
  });

  socket.on('chat-started', () => {
    // Remove any "Waiting for a stranger..." messages.
    const messages = chatWindow.getElementsByTagName('p');
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].textContent.includes('Waiting for a stranger')) {
        messages[i].remove();
      }
    }
    appendCriticalSystemMessage('Stranger connected! Say hello.');
    setConnectedUI();
  });

  socket.on('user-disconnected', () => {
    appendSystemMessage('Stranger disconnected.');
    setPartnerDisconnectedUI();
  });

  socket.on('receive-message', (message) => {
    appendMessage('Stranger', message);
  });

  // ============================================================================
  // 8) SEND MESSAGE FUNCTIONALITY
  // ============================================================================
  sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('send-message', message, roomId);
      appendMessage('You', message);
      messageInput.value = '';
    }
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendButton.click();
    }
  });

  // ============================================================================
  // 9) REPORT LOGIC: SHOWING THE REPORT MODAL AND HANDLING REPORTS
  // ============================================================================
  reportButton.addEventListener('click', () => {
    if (!roomId) {
      alert('No active room to report.');
      return;
    }
    if (reportSubmitted) {
      alert('Report already submitted!');
      return;
    }
    reportModal.style.display = 'block';
  });

  reportForm.addEventListener('change', () => {
    const formData = new FormData(reportForm);
    let selectedReason = formData.get('reason');
    if (!selectedReason) {
      submitReportBtn.disabled = true;
      return;
    }
    if (selectedReason === 'Other') {
      const customText = otherTextInput.value.trim();
      if (!customText) {
        submitReportBtn.disabled = true;
        return;
      }
    }
    submitReportBtn.disabled = false;
  });

  otherTextInput.addEventListener('input', () => {
    const formData = new FormData(reportForm);
    let selectedReason = formData.get('reason');
    if (selectedReason === 'Other') {
      submitReportBtn.disabled = otherTextInput.value.trim() === '';
    }
  });

  reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(reportForm);
    let selectedReason = formData.get('reason');
    if (selectedReason === 'Other') {
      const customText = otherTextInput.value.trim();
      selectedReason = `Other: ${customText}`;
    }
    socket.emit('report', { roomId, reason: selectedReason });
    appendSystemMessage('Report submitted.');
    console.log(`Reported room: ${roomId}, Reason: ${selectedReason}`);
    reportSubmitted = true;
    reportModal.style.display = 'none';
    reportForm.reset();
    submitReportBtn.disabled = true;
  });

  cancelReportBtn.addEventListener('click', () => {
    reportModal.style.display = 'none';
    reportForm.reset();
    submitReportBtn.disabled = true;
  });

  // ============================================================================
  // 10) STOP & NEXT FUNCTIONALITY
  // ============================================================================
  stopButton.addEventListener('click', () => {
    appendSystemMessage('Chat stopped, Disconnected!');
    socket.disconnect();
    sendButton.disabled = true;
    messageInput.disabled = true;
    stopButton.disabled = true;
    reportButton.style.display = 'none';
    // Next button remains visible permanently.
    nextButton.style.display = 'inline-block';
  });

  nextButton.addEventListener('click', () => {
    window.location.reload();
  });
});
