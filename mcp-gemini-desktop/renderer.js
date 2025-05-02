// renderer.js
import {marked} from "./node_modules/marked/lib/marked.esm.js";
import katex from "./node_modules/katex/dist/katex.mjs";

document.addEventListener("DOMContentLoaded", async () => {
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const chatMessages = document.getElementById("chat-messages");
  const addServerBtn = document.getElementById("add-server-btn");
  const serverList = document.getElementById("server-list");
  const settingsBtn = document.getElementById("settings-btn");
  const taskButtonsContainer = document.getElementById("task-buttons-container");
  // Add reference to the new current task display area
  const currentTaskDisplay = document.getElementById("current-task-display"); // New UI element
  const currentTaskNameEl = document.getElementById("current-task-name"); // Element to show task name
  const currentTaskClearBtn = document.getElementById("current-task-clear-btn"); // Button to clear task
  const currentTaskExpandBtn = document.getElementById("current-task-expand-btn"); // Expand/collapse button
  const currentTaskContentArea = document.getElementById("current-task-content-area"); // Area for task content
  const currentTaskHeader = document.querySelector(".current-task-header"); // Header area for click listener
  // Add Task Management Modal Elements
  const manageTasksBtn = document.getElementById("manage-tasks-btn");
  const taskManagementModal = document.getElementById("task-management-modal");
  const closeTaskModalBtn = document.getElementById("close-task-modal-btn");
  const taskManagementList = document.getElementById("task-management-list");
  const addNewTaskBtn = document.getElementById("add-new-task-btn");
  // Add Task Edit Form Elements
  const taskEditFormContainer = document.getElementById("task-edit-form-container");
  const taskEditForm = document.getElementById("task-edit-form");
  const taskFormTitle = document.getElementById("task-form-title");
  const taskEditId = document.getElementById("task-edit-id"); // Hidden field for existing ID
  const taskEditIdNew = document.getElementById("task-edit-id-new"); // Visible field for new ID
  const taskEditIdNewGroup = taskEditIdNew.closest(".form-group"); // Get the parent group to show/hide
  const taskEditName = document.getElementById("task-edit-name");
  const taskEditDescription = document.getElementById("task-edit-description");
  const taskMarkdownFilesList = document.getElementById("task-markdown-files-list"); // New list container
  const addMarkdownFileBtn = document.getElementById("add-markdown-file-btn"); // New add button
  const saveTaskBtn = document.getElementById("save-task-btn");
  const cancelEditTaskBtn = document.getElementById("cancel-edit-task-btn");
  // Add Markdown Editor Elements
  const markdownEditorContainer = document.getElementById("markdown-editor-container");
  const markdownEditorTitle = document.getElementById("markdown-editor-title");
  const markdownEditArea = document.getElementById("markdown-edit-area");
  const saveMarkdownBtn = document.getElementById("save-markdown-btn");
  const closeMarkdownEditorBtn = document.getElementById("close-markdown-editor-btn");

  let pythonPort = null;
  let serverRefreshInterval = null;
  let currentChatId = null; // Added for potential future use
  let currentTaskContext = null; // Variable to store the active task { id, name, content }
  let previousModalView = 'list'; // Track view before opening editor ('list' or 'form')

  function renderLaTeX(text) {
    const latexPlaceholders = [];
    let placeholderIndex = 0;

    function replaceAndRender(match, displayMode) {
      const latex = match.slice(displayMode ? 2 : 1, -(displayMode ? 2 : 1));
      try {
        const rendered = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: displayMode,
          output: "html",
        });
        const placeholder = `__LATEX_PLACEHOLDER_${placeholderIndex++}__`;
        latexPlaceholders.push({placeholder, rendered});
        return placeholder;
      } catch (e) {
        console.error("KaTeX rendering error:", e);
        return match; // Return original on error
      }
    }

    let processedText = text.replace(/\$\$([\s\S]*?)\$\$/g, (match) =>
      replaceAndRender(match, true)
    );
    processedText = processedText.replace(
      /(?<!\$)\$([^$]+)\$(?!\$)/g,
      (match) => replaceAndRender(match, false)
    );

    return {processedText, latexPlaceholders};
  }

  // Returns the created messageDiv element
  function addMessage(text, sender) {
      const messageDiv = document.createElement("div");
      // Add base 'message' class
      messageDiv.classList.add("message");
      // Split sender string and add classes individually
      const senderClasses = sender.split(' ').filter(cls => cls);
      senderClasses.forEach(cls => messageDiv.classList.add(cls));

      const toolCallPatterns = [
          /need to make a call to the .* function/i,
          /using the .* tool/i,
          /calling the .* function/i,
          /let me use the .* tool/i,
          /i need to use the .* tool/i,
          /to get .* i need to make a call to the .* function/i,
      ];

      // --- Tool Status Message Handling ---
      let isToolStatusMessage = false;
      let toolStatusType = ''; // 'start' or 'end'
      let toolStatusDetails = '';
      if (typeof text === 'string') {
          if (text.startsWith("TOOL_CALL_START:") || text.startsWith("TOOL_CALL_END:")) {
              isToolStatusMessage = true;
              toolStatusType = text.startsWith("TOOL_CALL_START:") ? 'start' : 'end';
              toolStatusDetails = text.substring(text.startsWith("TOOL_CALL_START:") ? 12 : 10).trim();
              // Ensure correct classes are set
              messageDiv.classList.remove('ai', 'user', 'system'); // Remove others if present
              messageDiv.classList.add("system", "tool-status");
              sender = "system tool-status"; // Update sender variable for logic below
          }
      }
      // --- End Tool Status Message Handling ---

      const isToolCallAnnouncement = // Keep original pattern matching for now
          sender === "ai" && toolCallPatterns.some((pattern) => pattern.test(text));
      const isSystemMessage = sender.startsWith("system"); // Includes "system", "system error", "system tool-status"

      // Use collapsible details for system messages AND tool status messages
      if (isSystemMessage) { // Simplified check now includes tool status
          const details = document.createElement("details");
          details.classList.add("message-details");
          if (isToolStatusMessage) details.open = true; // Open tool status by default

          const summary = document.createElement("summary");
          summary.classList.add("message-summary");

          // Set summary text based on type
          if (isToolStatusMessage) {
              const toolName = toolStatusDetails.split(' ')[0] || 'Unknown Tool';
              if (toolStatusType === 'start') {
                  summary.textContent = `Calling Tool: ${toolName}...`;
              } else { // 'end'
                  const statusPart = toolStatusDetails.split('status=')[1] || ''; // Get everything after 'status='
                  const isError = statusPart.toLowerCase().startsWith('error');
                  summary.textContent = `Tool Finished: ${toolName} (${isError ? 'Error' : 'Success'})`;
                  if (isError) summary.style.color = 'var(--status-error)'; // Style error summary
              }
          } else if (isToolCallAnnouncement) { // Keep this for now
              summary.textContent = "AI is using a tool...";
          } else { // Regular system message
              summary.textContent = text.startsWith("Error:") ? "System Error" : "System Message";
              if (text.startsWith("Error:")) summary.style.color = 'var(--status-error)';
          }

          const detailsContent = document.createElement("div");
          detailsContent.classList.add("message-details-content");
          // For tool status, only show the status part in details, not the full raw result
          if (isToolStatusMessage) {
              const statusPart = toolStatusDetails.split('status=')[1] || toolStatusDetails; // Fallback to full details if 'status=' not found
              detailsContent.textContent = statusPart.trim();
              detailsContent.style.overflowWrap = 'break-word'; // Ensure status text wraps
          } else {
             detailsContent.textContent = text; // Show full text for regular system messages
          }

          details.appendChild(summary);
          details.appendChild(detailsContent);
          messageDiv.appendChild(details);
      } else { // Regular user or AI message
          const contentDiv = document.createElement("div");
          contentDiv.classList.add("message-content");

          if (sender === "ai") {
              try {
                  const {processedText, latexPlaceholders} = renderLaTeX(text);
                  let html = marked.parse(processedText);
                  latexPlaceholders.forEach(({placeholder, rendered}) => {
                      html = html.replace(placeholder, rendered);
                  });
                  contentDiv.innerHTML = html;
              } catch (parseError) {
                  console.error("Error parsing AI message content:", parseError);
                  contentDiv.textContent = text; // Fallback to raw text on error
              }
          } else { // User message
              contentDiv.textContent = text;
          }
          messageDiv.appendChild(contentDiv);
      }

      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return messageDiv; // Return the created element
  }

  // --- Helper Functions defined at the correct scope ---

  // Function to update the display of the currently selected task
  function updateCurrentTaskDisplay() {
      if (currentTaskContext) {
          currentTaskNameEl.textContent = currentTaskContext.name;
          currentTaskDisplay.style.display = 'flex'; // Use flex instead of block
          // Ensure content area is populated if it was previously expanded
          if (currentTaskDisplay.classList.contains('expanded')) {
             currentTaskContentArea.innerText = currentTaskContext.content; // Use innerText to preserve whitespace
          } else {
             currentTaskContentArea.innerText = ''; // Clear content if collapsed
          }
      } else {
          currentTaskNameEl.textContent = '';
          currentTaskContentArea.innerText = ''; // Clear content
          currentTaskDisplay.classList.remove('expanded'); // Ensure collapsed
          currentTaskDisplay.style.display = 'none'; // Hide the display area
      }
      // TODO: Add logic to show/hide full task content on click/expand
  }

  // Function to clear the current task
  function clearCurrentTask() {
    console.log("Clearing current task");
    currentTaskContext = null;
    updateCurrentTaskDisplay(); // This will hide and reset the display
  }

  // Function to toggle task content visibility
  function toggleTaskContent() {
      if (!currentTaskContext) return; // No task active

      currentTaskDisplay.classList.toggle('expanded');

      if (currentTaskDisplay.classList.contains('expanded')) {
          // Populate content when expanding
          currentTaskContentArea.innerText = currentTaskContext.content; // Use innerText
          // Scroll content area to top if needed
          currentTaskContentArea.scrollTop = 0;
      } else {
          // Clear content when collapsing (optional, but cleaner)
          // currentTaskContentArea.innerText = '';
      }
  }

  // Function to adjust textarea height based on content
  function adjustTextareaHeight() {
      // Ensure messageInput is accessible in this scope or passed as an argument
      // Assuming messageInput is accessible from the outer scope
      if (messageInput) {
          messageInput.style.height = "auto"; // Reset first
          // Set max height constraint (e.g., 150px from original listener)
          const maxHeight = 150; 
          messageInput.style.height = `${Math.min(messageInput.scrollHeight, maxHeight)}px`;
      }
  }

  // Helper function to update content of an existing message div
  function updateMessageContent(messageDiv, text, senderClass) {
      // Clear existing content and classes related to sender/type
      messageDiv.innerHTML = '';
      messageDiv.className = 'message'; // Reset class list
      // Split the potentially multi-word class string and add classes individually
      const classesToAdd = senderClass.split(' ').filter(cls => cls); // Filter out empty strings
      classesToAdd.forEach(cls => messageDiv.classList.add(cls));

      // --- Tool Status Message Handling (Copied from addMessage) ---
      let isToolStatusMessage = false;
      let toolStatusType = '';
      let toolStatusDetails = '';
       if (typeof text === 'string') {
          if (text.startsWith("TOOL_CALL_START:")) {
              isToolStatusMessage = true;
              toolStatusType = 'start';
              toolStatusDetails = text.substring("TOOL_CALL_START:".length).trim();
              senderClass = "system tool-status"; // Ensure correct class
              messageDiv.classList.remove('ai', 'user', 'system', 'ai-loading');
              messageDiv.classList.add("system", "tool-status");
          } else if (text.startsWith("TOOL_CALL_END:")) {
              isToolStatusMessage = true;
              toolStatusType = 'end';
              toolStatusDetails = text.substring("TOOL_CALL_END:".length).trim();
              senderClass = "system tool-status"; // Ensure correct class
              messageDiv.classList.remove('ai', 'user', 'system', 'ai-loading'); // Use valid class name here too
              messageDiv.classList.add("system", "tool-status");
          }
      }
      // --- End Tool Status Message Handling ---

      // Re-apply rendering logic (similar to addMessage)
      const isSystemMessage = senderClass.startsWith("system");
      const isAiMessage = senderClass === "ai";

      // Use collapsible details for system messages AND tool status messages
      if (isSystemMessage) { // Includes tool status and errors
          const details = document.createElement("details");
          details.classList.add("message-details");
          if (isToolStatusMessage) details.open = true; // Open tool status by default

          const summary = document.createElement("summary");
          summary.classList.add("message-summary");

          if (isToolStatusMessage) {
              const toolName = toolStatusDetails.split(' ')[0] || 'Unknown Tool';
              if (toolStatusType === 'start') {
                  summary.textContent = `Calling Tool: ${toolName}...`;
              } else { // 'end'
                  const statusPart = toolStatusDetails.split('status=')[1] || ''; // Get everything after 'status='
                  const isError = statusPart.toLowerCase().startsWith('error');
                  summary.textContent = `Tool Finished: ${toolName} (${isError ? 'Error' : 'Success'})`;
                   if (isError) summary.style.color = 'var(--status-error)';
              }
          } else { // Regular system message or system error
              summary.textContent = text.startsWith("Error:") ? "System Error" : "System Message";
              // Check for the 'error' class specifically
              if (messageDiv.classList.contains("error") || text.startsWith("Error:")) {
                 summary.style.color = 'var(--status-error)';
              }
          }

          const detailsContent = document.createElement("div");
          detailsContent.classList.add("message-details-content");
          // For tool status, only show the status part in details
          if (isToolStatusMessage) {
              const statusPart = toolStatusDetails.split('status=')[1] || toolStatusDetails;
              detailsContent.textContent = statusPart.trim();
              detailsContent.style.overflowWrap = 'break-word'; // Ensure status text wraps
          } else {
             detailsContent.textContent = text; // Show full text for regular system messages
          }

          details.appendChild(summary);
          details.appendChild(detailsContent);
          messageDiv.appendChild(details);

      } else if (isAiMessage) {
          const contentDiv = document.createElement("div");
          contentDiv.classList.add("message-content");
           try {
              const {processedText, latexPlaceholders} = renderLaTeX(text);
              let html = marked.parse(processedText);
              latexPlaceholders.forEach(({placeholder, rendered}) => {
                html = html.replace(placeholder, rendered);
              });
              contentDiv.innerHTML = html;
            } catch (parseError) {
               console.error("Error parsing AI message content:", parseError);
               contentDiv.textContent = text; // Fallback to raw text on error
            }
          messageDiv.appendChild(contentDiv);
      } else { // Should primarily be 'user' or 'ai-loading'
           messageDiv.textContent = text; // Default to text for user or loading placeholder
      }
      chatMessages.scrollTop = chatMessages.scrollHeight; // Ensure scroll stays at bottom
  }


  // Helper function to handle potentially multi-line backend responses
  // containing status messages and the final AI reply.
  function handleBackendResponse(loadingMessageDiv, responseText) {
      const lines = responseText.split('\n');
      const statusMessages = [];
      const finalReplyLines = [];

      lines.forEach(line => {
          if (line.startsWith("TOOL_CALL_START:") || line.startsWith("TOOL_CALL_END:")) {
              statusMessages.push(line);
          } else if (line.trim().length > 0) { // Collect non-empty lines for final reply
              finalReplyLines.push(line);
          }
      });

      // Display status messages first as separate messages
      statusMessages.forEach(statusMsg => {
          addMessage(statusMsg, "system"); // Let addMessage handle parsing TOOL_CALL_*
      });

      // Update the original loading message with the final AI reply
      const finalReply = finalReplyLines.join('\n').trim();
      if (loadingMessageDiv) { // Check if loading message still exists
          if (finalReply) {
              updateMessageContent(loadingMessageDiv, finalReply, "ai");
          } else if (statusMessages.length > 0) {
              // If there were only status messages and no final reply text
              loadingMessageDiv.remove(); // Remove the original loading message
          } else {
              // If the response was completely empty or just whitespace
              updateMessageContent(loadingMessageDiv, "(Received empty response)", "system");
          }
      } else if (finalReply) {
          // If loading message was removed but we have a final reply, add it
          addMessage(finalReply, "ai");
      }
  }

  // --- End Helper Functions ---

  async function sendMessage() {
    const userMessage = messageInput.value.trim();
    // Check if there's a user message OR a task context (allow sending just the task)
    if ((!userMessage && !currentTaskContext) || !pythonPort) {
      if (!pythonPort) {
        addMessage("Error: Backend not connected.", "system");
      }
      // Maybe add a message if trying to send empty with no task?
      // else if (!userMessage && !currentTaskContext) {
      //    addMessage("Type a message or select a task first.", "system");
      // }
      return;
    }

    let messageToSend = userMessage;

    // Prepend task context if it exists
    if (currentTaskContext) {
        const taskHeader = `## MASTER TASK GUIDE (${currentTaskContext.name}) ##`;
        const userHeader = "## USER MESSAGE ##";
        // If user also typed a message, include both headers and content
        if (userMessage) {
             messageToSend = `${taskHeader}\n${currentTaskContext.content}\n\n${userHeader}\n${userMessage}`;
        } else {
            // If only task is active, just send the task content with its header
            messageToSend = `${taskHeader}\n${currentTaskContext.content}`;
            // Add a placeholder in the chat history for clarity
            addMessage(`[Sending Task: ${currentTaskContext.name}]`, "user task-indicator"); // Add specific class
        }
    }

    // Add user message to chat only if they typed something
    if (userMessage) {
        addMessage(userMessage, "user");
    }

    messageInput.value = "";
    messageInput.style.height = "auto"; // Reset height after sending

    // Add a temporary loading message for AI response
    const loadingMessageDiv = addMessage("...", "ai-loading"); // Use valid class name

    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Send the potentially combined message
        body: JSON.stringify({message: messageToSend}),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({reply: `HTTP error! status: ${response.status}`}));
        throw new Error(
          errorData.reply || `HTTP error! status: ${response.status}`
        );
      }
      const data = await response.json();
      // Handle potential multi-line responses with status messages
      handleBackendResponse(loadingMessageDiv, data.reply);
    } catch (error) {
      console.error("Error sending message:", error);
      // Update loading message to show error
      if (loadingMessageDiv) { // Check if it exists before updating
        updateMessageContent(loadingMessageDiv, `Error: ${error.message}`, "system error");
      } else { // If loading message somehow got removed, add a new error message
        addMessage(`Error: ${error.message}`, "system error");
      }
    }
  }

  async function deleteServer(serverIdentifier) { // Use identifier
    if (!pythonPort) {
      addMessage("Cannot delete server: Backend not connected.", "system");
      return;
    }

    // Determine display name for message (might be path or name)
    const displayName = serverIdentifier.includes('/') || serverIdentifier.includes('\\')
      ? serverIdentifier.split(/[\\/]/).pop()
      : serverIdentifier;

    addMessage(
      `Attempting to remove server: ${displayName}`,
      "system"
    );
    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/servers`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({identifier: serverIdentifier}), // Send identifier
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        addMessage(
          `Server ${displayName} removed.`,
          "system"
        );
        await fetchAndRenderServers(); // Refresh the list
      } else {
        throw new Error(
          data.message || `Failed to remove server (status: ${response.status})`
        );
      }
    
      // Incorrectly nested helper functions removed from here.
    
    } catch (error) {
      console.error("Error removing server:", error);
      addMessage(`Error removing server: ${error.message}`, "system");
      await fetchAndRenderServers(); // Refresh list even on error
    }
  }

  function renderServerList(servers) {
    serverList.innerHTML = ""; // Clear existing list
    if (servers && servers.length > 0) {
      servers.forEach((server) => {
        const li = document.createElement("li");
        li.dataset.identifier = server.identifier; // Use identifier
        li.classList.add("server-item");

        const serverInfo = document.createElement("div");
        serverInfo.classList.add("server-info");

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("server-name");
        nameSpan.textContent = server.display_name; // Use display_name
        nameSpan.title = server.identifier; // Show full identifier on hover

        const statusSpan = document.createElement("span");
        statusSpan.classList.add(
          "server-status",
          server.status === "connected" ? "connected" : "error"
        );
        statusSpan.textContent = server.status;

        const deleteBtn = document.createElement("button");
        deleteBtn.classList.add("delete-server-btn");
        deleteBtn.innerHTML = "×"; // Simple 'x'
        deleteBtn.title = "Remove Server";
        deleteBtn.onclick = () => deleteServer(server.identifier); // Pass identifier

        serverInfo.appendChild(nameSpan);
        serverInfo.appendChild(statusSpan);
        serverInfo.appendChild(deleteBtn);
        li.appendChild(serverInfo);

        if (server.tools && server.tools.length > 0) {
          const toolsContainer = document.createElement("div");
          toolsContainer.classList.add("tools-container");
          const toolsTitle = document.createElement("span");
          toolsTitle.classList.add("tools-title");
          toolsTitle.textContent = "Tools:";
          toolsContainer.appendChild(toolsTitle);

          const toolsList = document.createElement("ul");
          toolsList.classList.add("tools-list");
          server.tools.forEach((toolName) => {
            const toolLi = document.createElement("li");
            toolLi.textContent = toolName;
            toolsList.appendChild(toolLi);
          });
          toolsContainer.appendChild(toolsList);
          li.appendChild(toolsContainer);
        }

        serverList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No MCP servers connected.";
      li.style.justifyContent = "center";
      li.style.color = "var(--text-secondary)";
      serverList.appendChild(li);
    }
  }

  async function fetchAndRenderServers() {
    if (!pythonPort) return;
    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/servers`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === "success") {
        renderServerList(data.servers);
      } else {
        throw new Error(data.message || "Failed to fetch servers");
      }
    } catch (error) {
      console.error("Error fetching servers:", error);
      renderServerList([]);
      addMessage(`Error fetching server list: ${error.message}`, "system");
      if (serverRefreshInterval) {
        clearInterval(serverRefreshInterval);
        serverRefreshInterval = null;
        addMessage(
          "Stopping automatic server refresh due to connection error.",
          "system"
        );
      }
    }
  }

  async function initializeApp() {
    try {
      pythonPort = await window.electronAPI.getPythonPort();
      console.log(`Python backend running on port: ${pythonPort}`);
      addMessage("Welcome to GemCP Chat!", "ai"); // Changed from "system" to "ai"
      await fetchAndRenderServers();
      if (!serverRefreshInterval) {
        serverRefreshInterval = setInterval(fetchAndRenderServers, 10000);
      }

      // Initial load
      await fetchAndRenderServers();
      // Setup periodic refresh (Handled implicitly by setInterval in fetchAndRenderServers success/error)
      // setupServerRefresh(); // Already removed
      // Load the currently set model on startup
      // await loadCurrentModel(); // <-- REMOVE THIS LINE

      // Load tasks after initialization
      await loadAndDisplayTasks();

    } catch (error) {
      console.error("Error initializing app:", error);
      addMessage(
        "Error connecting to backend. Please ensure it is running.",
        "system"
      );
      renderServerList([]);
      if (serverRefreshInterval) {
        clearInterval(serverRefreshInterval);
        serverRefreshInterval = null;
      }
    }
  }

  // --- Task Handling ---
  async function handleTaskButtonClick(taskId) {
    console.log("Task button clicked:", taskId);
    const taskButton = taskButtonsContainer.querySelector(`[data-task-id=\"${taskId}\"]`);
    const taskName = taskButton ? taskButton.textContent : taskId;
    const loadingMsg = addMessage(`Loading task context: ${taskName}...`, "system");

    // If the same task is clicked again, clear it instead of loading
    if (currentTaskContext && currentTaskContext.id === taskId) {
        clearCurrentTask();
        if (loadingMsg) loadingMsg.remove();
        // Optionally, visually deselect the button
        document.querySelectorAll('.task-button.selected').forEach(btn => btn.classList.remove('selected'));
        return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/tasks/${taskId}/content`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      if (data.status === 'success') {
        console.log(`Set active task context ${taskId}:`, data.content.substring(0, 100) + "..."); // Log snippet

        // Store task context instead of putting in input
        currentTaskContext = {
            id: taskId,
            name: taskName,
            content: data.content
        };

        updateCurrentTaskDisplay(); // Update the new UI element

        // Remove the loading message on success
        if (loadingMsg) loadingMsg.remove();

        // Visually indicate selection (optional)
        document.querySelectorAll('.task-button.selected').forEach(btn => btn.classList.remove('selected'));
        if (taskButton) taskButton.classList.add('selected');

      } else {
        throw new Error(data.message || `Backend failed to get content for task ${taskId}`);
      }

    } catch (error) {
      console.error(`Error handling task button click for ${taskId}:`, error);
      // Clear context on error
      clearCurrentTask();
      // Update the loading message to show the error
      if (loadingMsg) {
        updateMessageContent(loadingMsg, `Error loading task ${taskName}: ${error.message}`, "system error");
      } else {
        addMessage(`Error loading task ${taskName}: ${error.message}`, "system error");
      }
    }
  }

  async function loadAndDisplayTasks() {
    if (!taskButtonsContainer) return; // Exit if container doesn't exist

    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}/tasks`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("Received tasks:", data);

      taskButtonsContainer.innerHTML = ''; // Clear existing buttons

      if (data.status === 'success' && data.tasks && data.tasks.length > 0) {
        data.tasks.forEach(task => {
          const button = document.createElement("button");
          button.classList.add("task-button");
          button.textContent = task.name;
          button.title = task.description || task.name; // Use description as tooltip
          button.dataset.taskId = task.id; // Store task ID

          button.addEventListener("click", () => handleTaskButtonClick(task.id));
          taskButtonsContainer.appendChild(button);
        });
      } else if (data.status !== 'success') {
         console.warn("Failed to load tasks:", data.message);
         // Optionally show a message in the container
         // taskButtonsContainer.textContent = "Could not load tasks.";
      } else {
          console.info("No tasks defined in tasks.json or tasks.json not found.");
          // Optionally hide the container or show a message
          // taskButtonsContainer.style.display = 'none';
      }

    } catch (error) {
      console.error("Error fetching or displaying tasks:", error);
      addMessage("Error loading task buttons: " + error, "system error");
      taskButtonsContainer.innerHTML = '<p class="error-text">Error loading tasks.</p>'; // Show error in container
    }
  }

  // --- End Task Handling ---

  // --- Task Management Modal Logic ---

  // Function to populate the task list in the modal
  function populateTaskManagementList(tasks) {
      taskManagementList.innerHTML = ''; // Clear loading/previous content
      if (!tasks || tasks.length === 0) {
          taskManagementList.innerHTML = '<p>No tasks defined yet.</p>';
          return;
      }

      const ul = document.createElement('ul');
      ul.classList.add('management-task-list'); // Add class for specific styling if needed
      tasks.forEach(task => {
          const li = document.createElement('li');
          li.classList.add('management-task-item');
          li.dataset.taskId = task.id;

          const taskName = document.createElement('span');
          taskName.classList.add('management-task-name');
          taskName.textContent = task.name;
          taskName.title = task.description || task.name;

          const taskActions = document.createElement('div');
          taskActions.classList.add('management-task-actions');

          const editBtn = document.createElement('button');
          editBtn.textContent = 'Edit';
          editBtn.classList.add('button-small'); // Use a smaller button style
          editBtn.onclick = () => showTaskEditForm(task); // Pass task data to edit form

          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.classList.add('button-small', 'button-danger'); // Add danger style
          deleteBtn.onclick = () => deleteTask(task.id, task.name); // Call delete function

          taskActions.appendChild(editBtn);
          taskActions.appendChild(deleteBtn);

          li.appendChild(taskName);
          li.appendChild(taskActions);
          ul.appendChild(li);
      });
      taskManagementList.appendChild(ul);
  }

  // Function to open the task management modal
  async function openTaskManagementModal() {
      if (!taskManagementModal) return;
      console.log("Opening task management modal...");
      taskManagementList.innerHTML = '<p>Loading tasks...</p>'; // Show loading state
      taskManagementModal.style.display = "block";

      // Fetch tasks from the backend
      try {
          const response = await fetch(`http://127.0.0.1:${pythonPort}/tasks`);
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          if (data.status === 'success') {
              populateTaskManagementList(data.tasks);
          } else {
              throw new Error(data.message || "Failed to load tasks from backend.");
          }
      } catch (error) {
          console.error("Error fetching tasks for management modal:", error);
          taskManagementList.innerHTML = `<p class="error-text">Error loading tasks: ${error.message}</p>`;
      }
  }

  // Function to close the task management modal
  function closeTaskManagementModal() {
      if (taskManagementModal) {
          taskManagementModal.style.display = "none";
      }
  }

  // Event Listeners for the modal
  if (manageTasksBtn) {
      manageTasksBtn.addEventListener("click", openTaskManagementModal);
  }
  if (closeTaskModalBtn) {
      closeTaskModalBtn.addEventListener("click", closeTaskManagementModal);
  }
  if (addNewTaskBtn) {
      addNewTaskBtn.addEventListener("click", () => showTaskEditForm(null)); // Show empty form
  }

  // Close modal if user clicks outside of the modal content
  window.addEventListener('click', (event) => {
      if (event.target === taskManagementModal) {
          closeTaskManagementModal();
      }
  });

  // --- End Task Management Modal Logic ---

  // --- Markdown File List Rendering & Drag/Drop Logic ---
  // Helper to render the list of markdown files in the edit form
  function renderMarkdownFileList(filePaths = []) {
      if (!taskMarkdownFilesList) return;
      taskMarkdownFilesList.innerHTML = ''; // Clear current list
      filePaths.forEach(filePath => {
          const item = document.createElement('div');
          item.classList.add('markdown-file-item');
          item.dataset.filePath = filePath; // Store the full path
          item.draggable = true; // Make it draggable for later

          const nameSpan = document.createElement('span');
          nameSpan.classList.add('markdown-file-name');
          nameSpan.textContent = filePath.split(/[\\/]/).pop(); // Show only filename
          nameSpan.title = filePath; // Show full path on hover
          // Add click listener to open editor
          item.addEventListener('click', () => openMarkdownEditor(filePath));

          const removeBtn = document.createElement('button');
          removeBtn.innerHTML = '&times;';
          removeBtn.classList.add('remove-file-btn');
          removeBtn.title = 'Remove File';
          removeBtn.onclick = (e) => {
              e.stopPropagation(); // Prevent opening editor when clicking remove
              item.remove(); // Remove the item from the list
          };

          item.appendChild(nameSpan);
          item.appendChild(removeBtn);
          taskMarkdownFilesList.appendChild(item);
      });

      // Add drag-and-drop listeners after rendering
      addDragAndDropListeners(taskMarkdownFilesList);
  }

  // --- Drag and Drop Logic for File List ---
  let draggedItem = null;

  function addDragAndDropListeners(listElement) {
      const items = listElement.querySelectorAll('.markdown-file-item');

      items.forEach(item => {
          item.addEventListener('dragstart', handleDragStart);
          item.addEventListener('dragend', handleDragEnd);
      });

      // Use the container for dragover and drop to handle dropping between items
      listElement.addEventListener('dragover', handleDragOver);
      listElement.addEventListener('drop', handleDrop);
  }

  function handleDragStart(e) {
      // Ensure the direct child is targeted for dragging
      if (!e.target.classList.contains('markdown-file-item')) return;
      draggedItem = e.target;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedItem.dataset.filePath); // Optional data transfer
      // Add a visual cue for dragging (optional)
      setTimeout(() => draggedItem.classList.add('dragging'), 0);
  }

  function handleDragEnd(e) {
      if (draggedItem) {
          draggedItem.classList.remove('dragging');
      }
      draggedItem = null;
      // Clean up any visual indicators if necessary
      const list = e.target.closest('.markdown-file-list');
      if(list) {
          list.querySelectorAll('.over').forEach(el => el.classList.remove('over'));
      }
  }

  function handleDragOver(e) {
      e.preventDefault(); // Necessary to allow dropping
      const listElement = e.currentTarget; // The ul/div container
      if (!draggedItem || !listElement.contains(draggedItem)) return; // Ensure dragged item is valid and part of this list
      e.dataTransfer.dropEffect = 'move';

      // Get the element being hovered over
      const overElement = e.target.closest('.markdown-file-item');

      // Remove previous visual indicators
      listElement.querySelectorAll('.over').forEach(el => el.classList.remove('over'));

      if (overElement && overElement !== draggedItem) {
          // Get position relative to the center of the overElement
          const rect = overElement.getBoundingClientRect();
          const offsetY = e.clientY - rect.top - (rect.height / 2);
          overElement.classList.add('over'); // Indicate visually
          // Store intended drop position (before/after) - might not be needed if logic is simple
      }
  }

  function handleDrop(e) {
      e.preventDefault();
      const listElement = e.currentTarget; // The ul/div container
      if (!draggedItem || !listElement.contains(draggedItem)) return; // Ensure dragged item is valid and part of this list

      const overElement = e.target.closest('.markdown-file-item');

      // Remove visual indicators
      listElement.querySelectorAll('.over').forEach(el => el.classList.remove('over'));

      if (overElement && overElement !== draggedItem) {
          const rect = overElement.getBoundingClientRect();
          const offsetY = e.clientY - rect.top - (rect.height / 2);
          if (offsetY < 0) {
              listElement.insertBefore(draggedItem, overElement);
          } else {
              listElement.insertBefore(draggedItem, overElement.nextSibling);
          }
      } else if (!overElement && listElement.contains(e.target)) {
          // If dropping in an empty area of the list container, append to the end
          listElement.appendChild(draggedItem);
      }
      // Drag end cleans up the rest
  }
  // --- End Drag and Drop Logic ---
  // --- End Markdown File List Logic ---


  // --- Add/Edit Form Logic ---
  function showTaskEditForm(taskToEdit = null) {
      console.log("Showing task edit form. Task to edit:", taskToEdit);
      // Reset form fields
      taskEditForm.reset(); // Should be accessible now
      taskEditId.value = ''; // Clear hidden existing ID

      if (taskToEdit) {
          // --- Editing existing task ---
          taskFormTitle.textContent = "Edit Task";
          taskEditId.value = taskToEdit.id; // Store existing ID in hidden field
          taskEditName.value = taskToEdit.name || '';
          taskEditDescription.value = taskToEdit.description || '';
          // Fetch full task details including markdownFiles
          // **Assumes the /tasks endpoint now returns full details**
          renderMarkdownFileList(taskToEdit.markdownFiles || []); // Populate file list

          // Hide the "new ID" input field when editing
          if (taskEditIdNewGroup) taskEditIdNewGroup.style.display = 'none';
          taskEditIdNew.required = false;

      } else {
          // --- Adding new task ---
          taskFormTitle.textContent = "Add New Task";
          // Show and require the "new ID" input field
          if (taskEditIdNewGroup) taskEditIdNewGroup.style.display = 'block';
          taskEditIdNew.required = true;
          taskEditIdNew.value = ''; // Ensure it's clear
          taskEditName.value = '';
          taskEditDescription.value = '';
          // taskEditMarkdownFiles.value = ''; // Replaced by renderMarkdownFileList
          renderMarkdownFileList([]); // Start with empty list for new task
      }

      // Hide the list and show the form
      taskManagementList.style.display = 'none'; // Should be accessible now
      taskEditFormContainer.style.display = 'block'; // Should be accessible now
  }

  function hideTaskEditForm() {
      taskEditFormContainer.style.display = 'none'; // Should be accessible now
      taskManagementList.style.display = 'block'; // Show the list again
      // Optionally re-fetch and render list here if needed after save/cancel
      // openTaskManagementModal(); // Re-opens and fetches fresh list (simple approach)
  }

  async function handleSaveTask(event) {
      event.preventDefault(); // Prevent default form submission
      console.log("Attempting to save task...");

      const isEditing = !!taskEditId.value;
      const taskId = isEditing ? taskEditId.value : taskEditIdNew.value.trim();
      const taskName = taskEditName.value.trim();
      const taskDescription = taskEditDescription.value.trim();
      // Get markdown files from the list items
      const markdownFiles = Array.from(taskMarkdownFilesList.querySelectorAll('.markdown-file-item')).map(item => item.dataset.filePath);

      if (!taskId || !taskName || markdownFiles.length === 0) {
          addMessage("Task ID, Name, and at least one Markdown File are required.", "system error");
          return;
      }
      if (!isEditing && !/^[a-zA-Z0-9_-]+$/.test(taskId)) {
          addMessage("Task ID can only contain letters, numbers, underscores, and hyphens.", "system error");
          return;
      }

      const taskData = {
          id: taskId,
          name: taskName,
          description: taskDescription,
          markdownFiles: markdownFiles
      };

      console.log("Task Data to Save:", taskData);
      addMessage(`Saving task: ${taskName}... (Backend not implemented yet)`, "system");

      // --- TODO: Backend Integration --- 
      try {
        const url = isEditing ? `/tasks/${taskId}` : '/tasks';
        const method = isEditing ? 'PUT' : 'POST';
        addMessage(`Sending ${method} request to ${url}...`, "system");
        const response = await fetch(`http://127.0.0.1:${pythonPort}${url}`, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
          throw new Error(result.message || `Failed to save task (status ${response.status})`);
        }
        addMessage(`Task '${taskName}' saved successfully.`, "system");
        hideTaskEditForm();
        openTaskManagementModal(); // Refresh list
        // Also refresh the main task buttons below chat
        await loadAndDisplayTasks(); // <-- Move this inside success block
      } catch (error) {
        console.error("Error saving task:", error);
        addMessage(`Error saving task: ${error.message}`, "system error");
      }
      // --- End TODO ---

      // // Old placeholder logic removed
      // hideTaskEditForm();
      // openTaskManagementModal(); // Refresh list view
      // await loadAndDisplayTasks(); 
  }
  // --- End Add/Edit Form Logic ---

  // --- Delete Task Logic ---
  async function deleteTask(taskId, taskName) {
      console.log(`Attempting to delete task: ${taskId} (${taskName})`);
      // Optional: Add a confirmation dialog
      const confirmed = confirm(`Are you sure you want to delete the task "${taskName}"?`);
      if (!confirmed) {
          console.log("Task deletion cancelled.");
          return;
      }

      addMessage(`Deleting task: ${taskName}...`, "system");

      try {
          const response = await fetch(`http://127.0.0.1:${pythonPort}/tasks/${taskId}`, {
              method: 'DELETE'
          });
          const result = await response.json();
          if (!response.ok || result.status !== 'success') {
              throw new Error(result.message || `Failed to delete task (status ${response.status})`);
          }
          addMessage(`Task '${taskName}' deleted successfully.`, "system");
          openTaskManagementModal(); // Refresh list in modal
          await loadAndDisplayTasks(); // Refresh main task buttons
      } catch (error) {
          console.error("Error deleting task:", error);
          addMessage(`Error deleting task '${taskName}': ${error.message}`, "system error");
      }
  }
  // --- End Delete Task Logic ---

  // --- Markdown Editor Logic ---
  async function openMarkdownEditor(filePath) {
      console.log(`Opening markdown editor for: ${filePath}`);
      if (!markdownEditorContainer) return;

      // Determine which view is currently visible to restore later
      if (taskEditFormContainer && taskEditFormContainer.style.display !== 'none') {
          previousModalView = 'form';
      } else {
          previousModalView = 'list';
      }

      // Hide other modal views
      if (taskManagementList) taskManagementList.style.display = 'none';
      if (taskEditFormContainer) taskEditFormContainer.style.display = 'none';
      if (addNewTaskBtn.closest('.modal-actions')) addNewTaskBtn.closest('.modal-actions').style.display = 'none'; // Hide main Add Task btn

      // Show editor and loading state
      markdownEditorTitle.textContent = `Edit: ${filePath.split(/[\\/]/).pop()}`;
      markdownEditArea.value = 'Loading content...';
      markdownEditorContainer.style.display = 'block';
      currentMarkdownFileEditing = filePath; // Store path

      // Fetch content
      try {
          const encodedPath = encodeURIComponent(filePath);
          const response = await fetch(`http://127.0.0.1:${pythonPort}/markdown-file-content?path=${encodedPath}`);
          if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` }));
              throw new Error(errorData.message || `HTTP error ${response.status}`);
          }
          const data = await response.json();
          if (data.status === 'success') {
              markdownEditArea.value = data.content;
          } else {
              throw new Error(data.message || "Failed to load file content.");
          }
      } catch (error) {
          console.error(`Error fetching markdown content for ${filePath}:`, error);
          markdownEditArea.value = `Error loading content: ${error.message}`;
          addMessage(`Error loading content for ${filePath}: ${error.message}`, "system error");
          // Maybe disable save button here
      }
  }

  function closeMarkdownEditor() {
      if (!markdownEditorContainer) return;
      // Ensure buttons are enabled when editor is closed manually or after save
      if(saveMarkdownBtn) saveMarkdownBtn.disabled = false;
      if(saveMarkdownBtn) saveMarkdownBtn.textContent = 'Save Content';
      if(closeMarkdownEditorBtn) closeMarkdownEditorBtn.disabled = false;

      markdownEditorContainer.style.display = 'none';
      currentMarkdownFileEditing = null;

      // Restore previous view
      if (previousModalView === 'form' && taskEditFormContainer) {
          taskEditFormContainer.style.display = 'block';
      } else if (taskManagementList) { // Default to list view
          taskManagementList.style.display = 'block';
          if (addNewTaskBtn.closest('.modal-actions')) addNewTaskBtn.closest('.modal-actions').style.display = 'block'; // Show main Add Task btn
      }
  }

  async function saveMarkdownContent() {
      if (!currentMarkdownFileEditing || !markdownEditorContainer || !saveMarkdownBtn) {
          console.warn("Save Markdown called but no file is being edited or elements missing.");
          return;
      }

      const filePath = currentMarkdownFileEditing;
      const content = markdownEditArea.value;
      console.log(`Saving content for: ${filePath}`);
      saveMarkdownBtn.textContent = 'Saving...';
      saveMarkdownBtn.disabled = true;
      closeMarkdownEditorBtn.disabled = true;

      try {
          const encodedPath = encodeURIComponent(filePath);
          const response = await fetch(`http://127.0.0.1:${pythonPort}/markdown-file-content?path=${encodedPath}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: content })
          });
          const result = await response.json();
          if (!response.ok || result.status !== 'success') {
              throw new Error(result.message || `Failed to save file (status ${response.status})`);
          }
          addMessage(`Successfully saved content for ${filePath.split(/[\\/]/).pop()}.`, "system");
          closeMarkdownEditor(); // Close editor on success
      } catch (error) {
          console.error("Error saving markdown content:", error);
          addMessage(`Error saving content for ${filePath.split(/[\\/]/).pop()}: ${error.message}`, "system error");
          // Re-enable buttons on error
          saveMarkdownBtn.textContent = 'Save Content';
          saveMarkdownBtn.disabled = false;
          closeMarkdownEditorBtn.disabled = false;
      }
  }

  // --- End Markdown Editor Logic ---

  // --- Helper function for Add Markdown File button ---
  async function handleAddMarkdownFileClick() {
       try {
          const dialogOptions = {
              properties: ['openFile', 'multiSelections'], // Allow multiple files
              filters: [{ name: 'Markdown Files', extensions: ['md'] }]
          };
          const selectedFiles = await window.electronAPI.showOpenDialog(dialogOptions);

          if (selectedFiles && selectedFiles.length > 0) {
              if (!taskMarkdownFilesList) {
                  console.error("taskMarkdownFilesList element not found!");
                  return;
              }
              const existingFiles = Array.from(taskMarkdownFilesList.querySelectorAll('.markdown-file-item')).map(item => item.dataset.filePath);
              const importedRelativePaths = [];
              let importErrors = 0;

              addMessage(`Importing ${selectedFiles.length} file(s)...`, "system");

              // Import each file via backend
              for (const absolutePath of selectedFiles) {
                  // Skip if already in the list (based on absolute path comparison before import)
                  if (existingFiles.includes(absolutePath)) {
                      console.log(`Skipping already listed file: ${absolutePath}`);
                      continue;
                  }
                  try {
                      console.log(`Requesting import for: ${absolutePath}`);
                      const response = await fetch(`http://127.0.0.1:${pythonPort}/import-markdown-file`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ sourcePath: absolutePath })
                      });
                      const result = await response.json();
                      if (!response.ok || result.status !== 'success') {
                          throw new Error(result.message || `Import failed (status ${response.status})`);
                      }
                      const relativePath = result.relativePath;
                      // Avoid adding duplicate relative paths if the same file is selected twice in one go
                      if (!existingFiles.includes(relativePath) && !importedRelativePaths.includes(relativePath)) {
                           importedRelativePaths.push(relativePath);
                           console.log(`Successfully imported. Relative path: ${relativePath}`);
                      } else {
                          console.log(`Skipping duplicate relative path after import: ${relativePath}`);
                      }
                  } catch (importError) {
                      console.error(`Failed to import file ${absolutePath}:`, importError);
                      addMessage(`Error importing ${absolutePath.split(/[\\/]/).pop()}: ${importError.message}`, "system error");
                      importErrors++;
                  }
              }

              // Render the list including newly imported relative paths
              const finalPaths = [...existingFiles, ...importedRelativePaths];
              renderMarkdownFileList(finalPaths);

              if (importErrors > 0) {
                  addMessage(`Finished importing with ${importErrors} error(s).`, "system");
              } else if (importedRelativePaths.length > 0) {
                  addMessage(`Successfully imported ${importedRelativePaths.length} file(s).`, "system");
              } else {
                   addMessage(`No new files were imported (already present or duplicates).`, "system");
              }
          }
      } catch (error) {
          console.error("Error selecting markdown files:", error);
          // Ensure addMessage is accessible
          if(typeof addMessage === 'function') {
             addMessage(`Error selecting files: ${error.message}`, "system error");
          } else {
             console.error("addMessage function not found!");
          }
      }
  }

  // --- Helper function for Add Server Button ---
  async function handleAddServerClick() {
     if (!pythonPort) {
        addMessage("Cannot add server: Backend not connected.", "system error"); // Corrected class
        return;
      }

      // Update dialog options to accept both .py and .json
      const dialogOptions = {
        properties: ["openFile"],
        filters: [
          { name: 'MCP Server Files', extensions: ['py', 'json'] },
          { name: 'Python Scripts', extensions: ['py'] },
          { name: 'JSON Config', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };

      try { // Wrap in try-catch
          const filePaths = await window.electronAPI.showOpenDialog(dialogOptions);

          if (filePaths && filePaths.length > 0) {
            const filePath = filePaths[0];
            const fileName = filePath.split(/[\\/]/).pop();

            if (filePath.endsWith('.py')) {
              // --- Handle Python Script ---
              console.log("Attempting to add Python server:", filePath);
              addMessage(`Attempting to add Python server: ${fileName}`, "system");
              try {
                const response = await fetch(`http://127.0.0.1:${pythonPort}/servers`, {
                  method: "POST",
                  headers: {"Content-Type": "application/json"},
                  body: JSON.stringify({path: filePath}), // Send path for .py
                });
                const data = await response.json();
                if (response.ok && data.status === "success") {
                  addMessage(`Server added from ${fileName}. Tools: ${data.tools.length > 0 ? data.tools.join(", ") : 'None'}`, "system");
                  await fetchAndRenderServers();
                  // Restart interval logic might need adjustment if it was cleared on error previously
                  // if (!serverRefreshInterval && pythonPort) { ... }
                } else {
                  throw new Error(data.message || `Failed to add server (status: ${response.status})`);
                }
              } catch (error) {
                console.error("Error adding Python server:", error);
                addMessage(`Error adding Python server ${fileName}: ${error.message}`, "system error");
                await fetchAndRenderServers(); // Refresh list even on error
              }
            } else if (filePath.endsWith('.json')) {
              // --- Handle JSON File ---
              console.log("Attempting to add servers from JSON:", filePath);
              addMessage(`Attempting to add servers from JSON file: ${fileName}`, "system");
              try {
                const jsonContent = await window.electronAPI.readFileContent(filePath);
                const config = JSON.parse(jsonContent);

                if (!config || typeof config.mcpServers !== 'object') {
                  throw new Error("Invalid JSON format. Missing 'mcpServers' object.");
                }

                const serverNames = Object.keys(config.mcpServers);
                if (serverNames.length === 0) {
                  addMessage(`No servers found in ${fileName}.`, "system");
                  return;
                }

                addMessage(`Found ${serverNames.length} server(s) in ${fileName}. Adding...`, "system");

                let allAddedSuccessfully = true;
                for (const serverName of serverNames) {
                  const serverDef = config.mcpServers[serverName];
                  if (!serverDef || !serverDef.command || !Array.isArray(serverDef.args)) {
                    addMessage(`Skipping invalid server definition for '${serverName}' in ${fileName}. Missing command or args.`, "system warning"); // Changed to warning
                    allAddedSuccessfully = false;
                    continue;
                  }

                  try {
                    const response = await fetch(`http://127.0.0.1:${pythonPort}/servers`, {
                      method: "POST",
                      headers: {"Content-Type": "application/json"},
                      body: JSON.stringify({ // Send name, command, args for JSON-defined servers
                        name: serverName,
                        command: serverDef.command,
                        args: serverDef.args
                      }),
                    });
                    const data = await response.json();
                    if (response.ok && data.status === "success") {
                       addMessage(`Server '${serverName}' added. Tools: ${data.tools.length > 0 ? data.tools.join(", ") : 'None'}`, "system");
                    } else {
                       throw new Error(data.message || `Failed to add server '${serverName}' (status: ${response.status})`);
                    }
                  } catch (serverAddError) {
                     console.error(`Error adding server '${serverName}':`, serverAddError);
                     addMessage(`Error adding server '${serverName}': ${serverAddError.message}`, "system error");
                     allAddedSuccessfully = false;
                  }
                } // End for loop

                await fetchAndRenderServers(); // Refresh list after attempting all adds
                // Restart interval logic might need adjustment

              } catch (error) {
                console.error("Error processing JSON server file:", error);
                addMessage(`Error processing ${fileName}: ${error.message}`, "system error");
                await fetchAndRenderServers(); // Refresh list even on JSON processing error
              }
            } else {
              addMessage(`Unsupported file type: ${fileName}. Please select a .py or .json file.`, "system warning"); // Changed to warning
            }
          }
      } catch(error) { // Catch errors from showOpenDialog itself
          console.error("Error in Add Server process:", error);
          addMessage(`Error opening file dialog: ${error.message}`, "system error");
      }
  }

  // *** Event Listeners Setup ***
  // Main chat input listeners
  sendBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  messageInput.addEventListener("input", adjustTextareaHeight); // Use the named function

  // Sidebar listeners
  addServerBtn.addEventListener("click", handleAddServerClick); // Renamed for clarity
  settingsBtn.addEventListener("click", () => {
    window.electronAPI.openSettingsDialog();
  });

  // Task Management Modal listeners
  if (manageTasksBtn) {
      manageTasksBtn.addEventListener("click", openTaskManagementModal);
  }
  if (closeTaskModalBtn) {
      closeTaskModalBtn.addEventListener("click", closeTaskManagementModal);
  }
  if (addNewTaskBtn) {
       addNewTaskBtn.addEventListener("click", () => showTaskEditForm(null)); // Show empty form
  }

  // Add/Edit Task Form listeners
  if (taskEditForm) {
      taskEditForm.addEventListener('submit', handleSaveTask);
  }
  if (cancelEditTaskBtn) {
      cancelEditTaskBtn.addEventListener('click', hideTaskEditForm);
  }

  // Markdown Editor listeners
  if (saveMarkdownBtn) {
      saveMarkdownBtn.addEventListener('click', saveMarkdownContent);
  }
  if (closeMarkdownEditorBtn) {
      closeMarkdownEditorBtn.addEventListener('click', closeMarkdownEditor);
  }

   // Add listener for the Add File button (Moved to ensure it's within scope)
  if (addMarkdownFileBtn) {
      addMarkdownFileBtn.addEventListener('click', handleAddMarkdownFileClick); // Renamed for clarity
  }

  // Close modal if user clicks outside of the modal content
  window.addEventListener('click', (event) => {
      if (event.target === taskManagementModal) {
          closeTaskManagementModal();
      }
  });

  // Task Context Display listeners
  if (currentTaskClearBtn) {
      currentTaskClearBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent toggle when clicking clear button
          clearCurrentTask();
      });
  }
  // Use the header for toggling expand/collapse
  if (currentTaskHeader) {
    currentTaskHeader.addEventListener('click', toggleTaskContent);
  }

  initializeApp(); // Call initializeApp after all functions and listeners are defined

}); // End of DOMContentLoaded listener
