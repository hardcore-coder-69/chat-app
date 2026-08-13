const socket = io();

const joinScreen = document.getElementById("join-screen");
const chatScreen = document.getElementById("chat-screen");
const joinForm = document.getElementById("join-form");
const usernameInput = document.getElementById("username");
const roomInput = document.getElementById("room-id");
const joinError = document.getElementById("join-error");

const receiverNameEl = document.getElementById("receiver-name");
const messagesEl = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const typingEl = document.getElementById("typing");
const statusText = document.getElementById("status-text");
const statusDot = document.getElementById("status-dot");

// Image elements
const attachBtn = document.getElementById("attach-btn");
const imageInput = document.getElementById("image-input");
const previewContainer = document.getElementById("image-preview-container");
const previewImg = document.getElementById("image-preview");
const previewFilename = document.getElementById("preview-filename");
const removePreviewBtn = document.getElementById("remove-preview-btn");
const dragOverlay = document.getElementById("drag-overlay");

// Lightbox elements
const lightbox = document.getElementById("lightbox");
const lightboxBackdrop = document.getElementById("lightbox-backdrop");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxClose = document.getElementById("lightbox-close");

let myUsername = "";
let lastReceiver = "";
let typingTimer = null;
let stagedImage = null; // { dataUrl, name }
let dragCounter = 0;

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  myUsername = usernameInput.value.trim();
  const roomId = roomInput.value.trim().toUpperCase();

  if (!myUsername || !roomId) return;

  if (roomId !== "69420") {
    joinError.textContent = "Room not found";
    return;
  }

  joinError.textContent = "";

  socket.emit("join-room", {
    username: myUsername,
    roomId
  });
});

socket.on("join-error", (message) => {
  joinError.textContent = message;
});

socket.on("joined-room", ({ roomId, users }) => {
  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  lastReceiver = "";
  updateStatus(users);
  messageInput.focus();
  triggerMarkSeen();
});

socket.on("chat-history", (messages) => {
  messagesEl.innerHTML = "";
  messages.forEach(addMessage);

  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.username === myUsername && lastMsg.seen) {
      updateSeenDisplay(true);
    } else {
      updateSeenDisplay(false);
    }

    const hasUnseenOther = messages.some(
      (m) => m.username !== myUsername && !m.seen
    );
    if (hasUnseenOther) {
      triggerMarkSeen();
    }
  } else {
    updateSeenDisplay(false);
  }

  scrollToBottom();
});

socket.on("new-message", (message) => {
  addMessage(message);

  if (message.username === myUsername) {
    updateSeenDisplay(false);
  } else {
    updateSeenDisplay(false);
    triggerMarkSeen();
  }

  scrollToBottom();
});

socket.on("messages-seen", () => {
  updateSeenDisplay(true);
  scrollToBottom();
});

socket.on("user-joined", ({ username, users }) => {
  updateStatus(users);
  showSystemMessage(`${username} joined the chat.`);
});

socket.on("user-left", ({ username, users }) => {
  updateStatus(users);
  showSystemMessage(`${username} left the chat.`);
  typingEl.textContent = "";
});

socket.on("room-status", ({ users }) => {
  updateStatus(users);
});

socket.on("typing", ({ username }) => {
  typingEl.textContent = `${username} is typing...`;
});

socket.on("stop-typing", () => {
  typingEl.textContent = "";
});

// Image attachment triggers
attachBtn.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) {
    handleSelectedImageFile(file);
  }
  imageInput.value = "";
});

removePreviewBtn.addEventListener("click", () => {
  clearStagedImage();
  messageInput.focus();
});

// Clipboard paste support (Ctrl+V)
window.addEventListener("paste", (e) => {
  if (chatScreen.classList.contains("hidden")) return;

  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        handleSelectedImageFile(file);
        break;
      }
    }
  }
});

// Drag and drop support
chatScreen.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragOverlay) dragOverlay.classList.remove("hidden");
});

chatScreen.addEventListener("dragover", (e) => {
  e.preventDefault();
});

chatScreen.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (dragOverlay) dragOverlay.classList.add("hidden");
  }
});

chatScreen.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (dragOverlay) dragOverlay.classList.add("hidden");

  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.type.startsWith("image/")) {
      handleSelectedImageFile(file);
    }
  }
});

async function handleSelectedImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  try {
    const compressedDataUrl = await compressImage(file);
    stagedImage = {
      dataUrl: compressedDataUrl,
      name: file.name || "image.png"
    };

    previewImg.src = stagedImage.dataUrl;
    previewFilename.textContent = stagedImage.name;
    previewContainer.classList.remove("hidden");
    messageInput.focus();
  } catch (err) {
    console.error("Error loading image:", err);
  }
}

function clearStagedImage() {
  stagedImage = null;
  previewImg.src = "";
  previewFilename.textContent = "";
  previewContainer.classList.add("hidden");
}

function compressImage(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const isPng = file.type === "image/png";
        const mimeType = isPng ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, isPng ? undefined : quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Lightbox functionality
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  lightboxImg.src = "";
}

lightboxClose.addEventListener("click", closeLightbox);
lightboxBackdrop.addEventListener("click", closeLightbox);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !lightbox.classList.contains("hidden")) {
    closeLightbox();
  }
});

// Form submit
messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  const image = stagedImage ? stagedImage.dataUrl : null;

  if (!text && !image) return;

  if (image) {
    socket.emit("send-message", {
      text: text || "",
      image: image
    });
  } else {
    // Send plain string for text-only messages
    socket.emit("send-message", text);
  }

  messageInput.value = "";
  clearStagedImage();

  socket.emit("stop-typing");
  clearTimeout(typingTimer);
});

messageInput.addEventListener("input", () => {
  socket.emit("typing");

  clearTimeout(typingTimer);

  typingTimer = setTimeout(() => {
    socket.emit("stop-typing");
  }, 800);
});

function addMessage(message) {
  const isMine = message.username === myUsername;
  const wrapper = document.createElement("div");
  wrapper.className = `message ${
    isMine ? "mine" : ""
  }`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";

  const date = new Date(message.timestamp);
  const senderName = isMine ? "You" : message.username;
  meta.textContent = `${senderName} • ${formatTime(date)}`;
  bubble.appendChild(meta);

  let msgText = message.text;
  let msgImage = message.image;

  // Handle case where server sent payload nested in text (e.g. from previous server version)
  if (typeof msgText === "object" && msgText !== null) {
    if (msgText.image) msgImage = msgText.image;
    msgText = msgText.text;
  }

  if (msgImage) {
    const imgWrapper = document.createElement("div");
    imgWrapper.className = "chat-image-wrapper";

    const img = document.createElement("img");
    img.className = "chat-image";
    img.src = msgImage;
    img.alt = "Sent image";
    img.loading = "lazy";
    img.addEventListener("click", () => openLightbox(msgImage));

    imgWrapper.appendChild(img);
    bubble.appendChild(imgWrapper);
  }

  if (msgText && typeof msgText === "string" && msgText.trim()) {
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = msgText;
    bubble.appendChild(text);
  }

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
}

function showSystemMessage(text) {
  const el = document.createElement("div");
  el.style.textAlign = "center";
  el.style.color = "#98a2b3";
  el.style.fontSize = "12px";
  el.style.margin = "12px 0";
  el.textContent = text;

  messagesEl.appendChild(el);
  scrollToBottom();
}

function updateStatus(users) {
  if (!Array.isArray(users)) users = [];
  const otherUser = users.find((u) => u !== myUsername);

  if (otherUser) {
    lastReceiver = otherUser;
    if (receiverNameEl) {
      receiverNameEl.textContent = otherUser;
      receiverNameEl.classList.remove("waiting");
    }
    statusText.textContent = `${otherUser} is online`;
    statusDot.classList.remove("offline");
    statusDot.classList.add("online");
  } else if (users.length === 1) {
    if (receiverNameEl) {
      receiverNameEl.textContent = lastReceiver ? `${lastReceiver} (Offline)` : "Waiting for partner...";
      receiverNameEl.classList.add("waiting");
    }
    statusText.textContent = "Waiting for the other person";
    statusDot.classList.remove("online");
    statusDot.classList.add("offline");
  } else {
    if (receiverNameEl) {
      receiverNameEl.textContent = "Offline";
      receiverNameEl.classList.add("waiting");
    }
    statusText.textContent = "Offline";
    statusDot.classList.remove("online");
    statusDot.classList.add("offline");
  }
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateSeenDisplay(isSeen) {
  const existingSeen = messagesEl.querySelectorAll(".seen-status");
  existingSeen.forEach((el) => el.remove());

  if (!isSeen) return;

  const allMessages = messagesEl.querySelectorAll(".message");
  if (allMessages.length === 0) return;

  const lastMessage = allMessages[allMessages.length - 1];
  if (lastMessage && lastMessage.classList.contains("mine")) {
    const seenEl = document.createElement("div");
    seenEl.className = "seen-status";
    seenEl.textContent = "Seen just now";
    lastMessage.appendChild(seenEl);
  }
}

function triggerMarkSeen() {
  if (chatScreen.classList.contains("hidden")) return;
  if (document.hidden) return;
  socket.emit("mark-seen");
}

window.addEventListener("focus", triggerMarkSeen);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    triggerMarkSeen();
  }
});
messageInput.addEventListener("focus", triggerMarkSeen);
chatScreen.addEventListener("click", triggerMarkSeen);

