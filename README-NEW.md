# GemCP Chat Quick Start

This guide explains how to run the GemCP Chat application, which consists of a Python backend and an Electron frontend.

## Prerequisites

- **Python:** 3.13+ (with `pip` available)
- **Node.js:** 16+ (with `npm` available)
- **Git:** For cloning the repository (if you haven't already).
- **uv:** A Python package installer (`pip install uv`). Required by the backend setup.
- **Google API Key:** A Gemini API key from Google Cloud.

## Setup

1.  **Clone the Repository (if needed):**
    ```bash
    git clone https://github.com/wemecan/gemini-desktop-mcp.git
    # Or clone your fork if you have one
    ```

2.  **Install Backend Dependencies:**
    - Open a terminal/command prompt.
    - Navigate to the backend directory:
      ```bash
      cd gemini-desktop-mcp/python_backend
      ```
    - Create and activate a virtual environment:
      ```bash
      # Create (only needs to be done once)
      python -m venv .venv 
      # Activate (use the command for your shell)
      # Windows (PowerShell):
      .venv\Scripts\Activate.ps1
      # Windows (Command Prompt):
      # .venv\Scripts\activate.bat
      # Linux/macOS:
      # source .venv/bin/activate 
      ```
      *(You should see `(.venv)` at the start of your prompt)*
    - Install dependencies using `uv`:
      ```bash
      # Install uv if you don't have it
      pip install uv 
      # Install project dependencies
      uv pip install . 
      ```

3.  **Install Frontend Dependencies:**
    - Navigate to the frontend directory:
      ```bash
      # From the python_backend directory:
      cd ../mcp-gemini-desktop 
      # Or from the project root:
      # cd gemini-desktop-mcp/mcp-gemini-desktop
      ```
    - Install Node.js dependencies:
      ```bash
      npm install
      ```

## Running the Application

**You need to run both the backend and frontend simultaneously in separate terminals.**

**1. Start the Python Backend:**

   - Open a **new terminal**.
   - Navigate to the backend directory:
     ```bash
     cd path/to/gemini-desktop-mcp/python_backend 
     ```
     *(Replace `path/to/` with the actual path)*
   - **Activate the virtual environment** (see Setup step 2).
   - **Set your Google API Key:**
     ```bash
     # Windows (PowerShell):
     $env:GOOGLE_API_KEY="YOUR_API_KEY_HERE" 
     # Windows (Command Prompt):
     # set GOOGLE_API_KEY=YOUR_API_KEY_HERE
     # Linux/macOS:
     # export GOOGLE_API_KEY=YOUR_API_KEY_HERE
     ```
     *(Replace `YOUR_API_KEY_HERE` with your actual key)*
   - **Run the backend server:**
     ```bash
     python mcp_flask_backend.py
     ```
   - Leave this terminal running. You should see output indicating the server is running on `http://127.0.0.1:5001`.

**2. Start the Electron Frontend:**

   - Open **another new terminal**.
   - Navigate to the frontend directory:
     ```bash
     cd path/to/gemini-desktop-mcp/mcp-gemini-desktop
     ```
     *(Replace `path/to/` with the actual path)*
   - **Run the frontend app:**
     ```bash
     npm start
     ```
   - The GemCP Chat application window should appear.

## Configuration

-   **API Key & Model:** You can set the API key and choose the Gemini model within the application's Settings (accessible via the gear icon).
-   **MCP Servers:** Add MCP servers (like the included calculator/weather examples or BrowserMCP) via the "Add Server" button in the sidebar.
-   **Tasks:** Configure custom tasks by editing `tasks.json` in the `gemini-desktop-mcp` directory and creating corresponding `.md` files in the `tasks_md` folder. (Task management UI added in `feat/tasks` branch). 