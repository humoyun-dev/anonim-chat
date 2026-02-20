(() => {
  const sidebar = document.querySelector("[data-sidebar]");
  const toggleBtn = document.querySelector("[data-sidebar-toggle]");

  if (sidebar && toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  const search = document.getElementById("chatSearch");
  const list = document.getElementById("conversationList");
  if (search && list) {
    search.addEventListener("input", () => {
      const q = (search.value || "").trim().toLowerCase();
      const items = list.querySelectorAll(".chat-list-item");
      for (const item of items) {
        const title = (item.querySelector(".chat-list-title")?.textContent || "")
          .trim()
          .toLowerCase();
        item.style.display = !q || title.includes(q) ? "" : "none";
      }
    });
  }

  // Chat page: realtime + auto-scroll.
  const selected = window.__CHAT_SELECTED__;
  const isChatPage = selected !== undefined;
  const chatEl = document.getElementById("chatMessages");
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;

  function getRoomKey(a, b) {
    return [a, b].sort((x, y) => x - y).join("_");
  }

  function upsertConversationPreview(message) {
    if (!list) return;
    const a = Math.min(message.sender, message.recipient);
    const b = Math.max(message.sender, message.recipient);
    const selector = `.chat-list-item[data-user-a="${a}"][data-user-b="${b}"]`;
    let item = list.querySelector(selector);

    const previewText =
      (message.text || "").trim() ||
      `[${message.kind || "media"}]`;
    const timeText = message.timestamp
      ? new Date(message.timestamp).toLocaleString()
      : "";

    if (!item) {
      item = document.createElement("a");
      item.className = "chat-list-item";
      item.href = `/chat/${a}/${b}`;
      item.dataset.userA = String(a);
      item.dataset.userB = String(b);
      item.innerHTML = `
        <div class="chat-list-title">${a} <span class="chat-list-arrow">↔</span> ${b}</div>
        <div class="chat-list-meta">
          <span class="chat-list-preview"></span>
          <span class="chat-list-time"></span>
        </div>
      `;
      list.prepend(item);
    }

    const previewEl = item.querySelector(".chat-list-preview");
    const timeEl = item.querySelector(".chat-list-time");
    if (previewEl) previewEl.textContent = previewText;
    if (timeEl) timeEl.textContent = timeText;

    if (list.firstChild !== item) list.prepend(item);
  }

  function appendMessageIfMatches(message) {
    if (!selected || !chatEl) return;
    const expected = getRoomKey(selected.userA, selected.userB);
    const actual = getRoomKey(message.sender, message.recipient);
    if (expected !== actual) return;

    const existing = chatEl.querySelector(
      `[data-message-id="${message._id}"]`
    );
    if (existing) return;

    const isLeft = message.sender === selected.userA;
    const row = document.createElement("div");
    row.className = `msg-row ${isLeft ? "left" : "right"}`;
    row.dataset.messageId = String(message._id);
    row.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-text"></div>
        <div class="msg-meta">
          <span class="msg-sender"></span>
          <span class="msg-time"></span>
        </div>
      </div>
    `;
    row.querySelector(".msg-text").textContent =
      (message.text || "").trim() || `[${message.kind || "media"}]`;
    row.querySelector(".msg-sender").textContent = String(message.sender);
    row.querySelector(".msg-time").textContent = message.timestamp
      ? new Date(message.timestamp).toLocaleString()
      : "";

    const nearBottom =
      chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 140;

    chatEl.appendChild(row);
    if (nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
  }

  if (isChatPage && typeof io === "function") {
    const socket = io();

    socket.on("connect", () => {
      if (selected && selected.userA && selected.userB) {
        socket.emit("joinConversation", {
          senderId: selected.userA,
          receiverId: selected.userB,
        });
      }
    });

    socket.on("conversationUpdated", (message) => {
      if (message && typeof message === "object") upsertConversationPreview(message);
    });

    socket.on("newMessage", (message) => {
      if (message && typeof message === "object") appendMessageIfMatches(message);
    });
  }
})();
