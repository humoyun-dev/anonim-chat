(() => {
  // Flash messages auto-dismiss
  const url = new URL(window.location.href);
  const flash = url.searchParams.get("flash");
  if (flash) {
    url.searchParams.delete("flash");
    window.history.replaceState({}, "", url.pathname + url.search);
  }

  const search = document.getElementById("chatSearch");
  const list = document.getElementById("conversationList");
  if (search && list) {
    search.addEventListener("input", () => {
      const q = (search.value || "").trim().toLowerCase();
      const items = list.querySelectorAll(".tg-conv-item");
      for (const item of items) {
        const name = (item.querySelector(".tg-conv-name")?.textContent || "")
          .trim()
          .toLowerCase();
        item.style.display = !q || name.includes(q) ? "" : "none";
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
    const selector = `.tg-conv-item[data-user-a="${a}"][data-user-b="${b}"]`;
    let item = list.querySelector(selector);

    const previewText =
      (message.text || "").trim() || `[${message.kind || "media"}]`;
    const timeText = message.timestamp
      ? new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    if (!item) {
      item = document.createElement("a");
      item.className = "tg-conv-item";
      item.href = `/chat/${a}/${b}`;
      item.dataset.userA = String(a);
      item.dataset.userB = String(b);
      const initA = String(a)[0] || "?";
      const initB = String(b)[0] || "?";
      item.innerHTML = `
        <div class="tg-avatar">${initA}${initB}</div>
        <div class="tg-conv-body">
          <div class="tg-conv-top">
            <span class="tg-conv-name">${a} ↔ ${b}</span>
            <span class="tg-conv-time"></span>
          </div>
          <div class="tg-conv-preview"></div>
        </div>
      `;
      list.prepend(item);
    }

    const previewEl = item.querySelector(".tg-conv-preview");
    const timeEl = item.querySelector(".tg-conv-time");
    if (previewEl) previewEl.textContent = previewText;
    if (timeEl) timeEl.textContent = timeText;

    if (list.firstChild !== item) list.prepend(item);
  }

  function appendMessageIfMatches(message) {
    if (!selected || !chatEl) return;
    const expected = getRoomKey(selected.userA, selected.userB);
    const actual = getRoomKey(message.sender, message.recipient);
    if (expected !== actual) return;

    const existing = chatEl.querySelector(`[data-message-id="${message._id}"]`);
    if (existing) return;

    const isLeft = message.sender === selected.userA;
    const row = document.createElement("div");
    row.className = `tg-msg ${isLeft ? "tg-msg-left" : "tg-msg-right"}`;
    row.dataset.messageId = String(message._id);
    row.innerHTML = `
      <div class="tg-bubble">
        <div class="tg-bubble-name"></div>
        <div class="tg-bubble-text"></div>
        <span class="tg-bubble-time"></span>
        <div class="tg-reactions"></div>
      </div>
    `;
    row.querySelector(".tg-bubble-name").textContent = String(message.sender);

    const imgKinds = ["photo", "document"];
    const videoKinds = ["sticker", "animation", "video", "video_note"];
    const audioKinds = ["voice", "audio"];
    const hasCaption = (message.text || "").trim();
    const isMediaOnly =
      message.mediaFileId &&
      (imgKinds.includes(message.kind) ||
        videoKinds.includes(message.kind) ||
        audioKinds.includes(message.kind)) &&
      !hasCaption;
    const bubbleEl = row.querySelector(".tg-bubble");
    if (isMediaOnly) bubbleEl.classList.add("tg-media-bubble");
    const bubbleBody = row.querySelector(".tg-bubble-text");

    if (message.mediaFileId && imgKinds.includes(message.kind)) {
      const a = document.createElement("a");
      a.href = `/tg-media/${message.mediaFileId}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "tg-media-link";
      const img = document.createElement("img");
      img.src = `/tg-media/${message.mediaThumbFileId || message.mediaFileId}`;
      img.alt = message.kind || "media";
      img.loading = "lazy";
      img.className = "tg-media-img";
      a.appendChild(img);
      bubbleBody.replaceWith(a);
      if (hasCaption) {
        const cap = document.createElement("div");
        cap.className = "tg-caption";
        cap.textContent = message.text.trim().slice(0, 200);
        a.insertAdjacentElement("afterend", cap);
      }
    } else if (message.mediaFileId && videoKinds.includes(message.kind)) {
      const a = document.createElement("a");
      a.href = `/tg-media/${message.mediaFileId}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "tg-media-link";
      const vid = document.createElement("video");
      vid.src = `/tg-media/${message.mediaFileId}`;
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.setAttribute("playsinline", "");
      vid.className =
        message.kind === "video_note" ? "tg-video-note" : "tg-media-img";
      a.appendChild(vid);
      bubbleBody.replaceWith(a);
      if (hasCaption) {
        const cap = document.createElement("div");
        cap.className = "tg-caption";
        cap.textContent = message.text.trim().slice(0, 200);
        a.insertAdjacentElement("afterend", cap);
      }
    } else if (message.mediaFileId && audioKinds.includes(message.kind)) {
      const wrap = document.createElement("div");
      wrap.className = "tg-audio-wrap";
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = `/tg-media/${message.mediaFileId}`;
      audio.className = "tg-audio-player";
      wrap.appendChild(audio);
      bubbleBody.replaceWith(wrap);
    } else {
      bubbleBody.textContent =
        (message.text || "").trim() || `[${message.kind || "media"}]`;
    }
    row.querySelector(".tg-bubble-time").textContent = message.timestamp
      ? new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
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
      if (message && typeof message === "object")
        upsertConversationPreview(message);
    });

    socket.on("newMessage", (message) => {
      if (message && typeof message === "object")
        appendMessageIfMatches(message);
    });

    socket.on(
      "reactionUpdate",
      ({ messageId, senderReaction, recipientReaction }) => {
        if (!chatEl || !messageId) return;
        const row = chatEl.querySelector(`[data-message-id="${messageId}"]`);
        if (!row) return;
        let container = row.querySelector(".tg-reactions");
        if (!container) {
          container = document.createElement("div");
          container.className = "tg-reactions";
          const bubble = row.querySelector(".tg-bubble");
          if (bubble) bubble.appendChild(container);
        }
        container.innerHTML = "";
        if (senderReaction) {
          const pill = document.createElement("span");
          pill.className = "tg-reaction-pill";
          pill.title = "Sender";
          pill.textContent = senderReaction;
          container.appendChild(pill);
        }
        if (recipientReaction) {
          const pill = document.createElement("span");
          pill.className = "tg-reaction-pill";
          pill.title = "Recipient";
          pill.textContent = recipientReaction;
          container.appendChild(pill);
        }
        if (!senderReaction && !recipientReaction) container.remove();
      },
    );
  }
})();
