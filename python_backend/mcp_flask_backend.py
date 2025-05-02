# python_backend/mcp_flask_backend.py
from mcp_chat_app import MCPChatApp
import sys
import os
import argparse
from flask import Flask, request, jsonify
import asyncio
import threading
import logging
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Path to the tasks.json file (assuming it's one level up from this script)
TASKS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tasks.json')

flask_app = Flask(__name__)
chat_app = None
loop = None
loop_ready = threading.Event()


def start_async_loop():
    global loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop_ready.set()
    logger.info("Asyncio loop started and ready.")
    loop.run_forever()


async def initialize_chat_app():
    global chat_app
    if chat_app is None:
        chat_app = MCPChatApp()
        try:
            await chat_app.initialize_gemini()
            logger.info("MCPChatApp initialized successfully.")
        except Exception as e:
            logger.error(
                f"Failed to initialize MCPChatApp: {e}", exc_info=True)
            chat_app = None
            raise
    return chat_app


async def add_server_async(path=None, name=None, command=None, args=None):
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500

    identifier = path if path else name
    if not identifier:
         return {"status": "error", "message": "Missing server identifier (path or name)"}, 400

    try:
        added_tools = await app.connect_to_mcp_server(path=path, name=name, command=command, args=args)
        server_display_name = os.path.basename(path) if path else name
        return {"status": "success", "message": f"Server '{server_display_name}' added.", "tools": added_tools}, 200
    except FileNotFoundError as e:
        return {"status": "error", "message": str(e)}, 404
    except ValueError as e: # Catches issues from connect_to_mcp_server like missing params
        return {"status": "error", "message": str(e)}, 400
    except Exception as e:
        logger.error(f"Error adding server {identifier}: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to add server: {e}"}, 500


async def disconnect_server_async(identifier):
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500
    try:
        disconnected = await app.disconnect_mcp_server(identifier)
        server_display_name = os.path.basename(identifier) if '/' in identifier or '\\' in identifier else identifier
        if disconnected:
            return {"status": "success", "message": f"Server '{server_display_name}' disconnected."}, 200
        else:
            return {"status": "error", "message": f"Server '{server_display_name}' not found or already disconnected."}, 404
    except Exception as e:
        logger.error(f"Error disconnecting server {identifier}: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to disconnect server: {e}"}, 500


async def get_servers_async():
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500
    servers = []
    # Now iterating through identifiers (path or name)
    for identifier, resources in app.server_resources.items():
        server_display_name = os.path.basename(identifier) if '/' in identifier or '\\' in identifier else identifier
        servers.append({
            "identifier": identifier, # Send the unique ID
            "display_name": server_display_name, # Send a user-friendly name
            "tools": sorted(resources.get('tools', [])),
            "status": resources.get('status', 'unknown')
        })
    return {"status": "success", "servers": servers}, 200


async def process_chat_async(message):
    app = await initialize_chat_app()
    if not app:
        return {"reply": "Error: Backend chat app not initialized."}, 500
    try:
        reply = await app.process_query(message)
        return {"reply": reply}, 200
    except Exception as e:
        logger.error(f"Error processing chat: {e}", exc_info=True)
        return {"reply": f"An error occurred: {e}"}, 500


async def set_api_key_async(api_key):
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500
    try:
        await app.set_api_key_and_reinitialize(api_key)
        return {"status": "success", "message": "API Key set and Gemini client re-initialized."}, 200
    except Exception as e:
        logger.error(
            f"Error setting API key and re-initializing: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to set API key: {e}"}, 500

# --- Model Switching Async Functions ---
async def set_model_async(model_name):
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500
    try:
        app.set_gemini_model(model_name)
        return {"status": "success", "message": f"Gemini model set to {model_name}."}, 200
    except ValueError as e: # Catch unsupported model error
        return {"status": "error", "message": str(e)}, 400
    except Exception as e:
        logger.error(f"Error setting Gemini model to {model_name}: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to set model: {e}"}, 500

async def get_model_async():
    app = await initialize_chat_app()
    if not app:
        return {"status": "error", "message": "Chat app not initialized"}, 500
    try:
        current_model = app.get_gemini_model()
        return {"status": "success", "model": current_model}, 200
    except Exception as e:
        logger.error(f"Error getting current Gemini model: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to get model: {e}"}, 500

async def list_models_async():
    app = await initialize_chat_app()
    if not app:
        # Return empty list even if app not fully initialized, as the list is static for now
        # If fetching dynamically, would return error here.
        temp_app = MCPChatApp() # Get default list
        return {"status": "success", "models": temp_app.get_available_models()}, 200
        # return {"status": "error", "message": "Chat app not initialized"}, 500
    try:
        available_models = app.get_available_models()
        return {"status": "success", "models": available_models}, 200
    except Exception as e:
        logger.error(f"Error listing available Gemini models: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to list models: {e}"}, 500
# --- End Model Switching Async Functions ---

# --- Task Endpoints ---

def read_tasks_config():
    """Helper function to read and parse tasks.json."""
    if not os.path.exists(TASKS_JSON_PATH):
        logger.warning(f"Tasks configuration file not found: {TASKS_JSON_PATH}")
        return None
    try:
        with open(TASKS_JSON_PATH, 'r') as f:
            config = json.load(f)
            if 'tasks' not in config or not isinstance(config['tasks'], list):
                logger.error(f"Invalid format in {TASKS_JSON_PATH}: 'tasks' key missing or not a list.")
                return None
            # Basic validation of task structure
            for task in config['tasks']:
                if not all(k in task for k in ('id', 'name', 'markdownFiles')) or not isinstance(task['markdownFiles'], list):
                    logger.error(f"Invalid task structure in {TASKS_JSON_PATH}: Missing required keys or markdownFiles not a list. Task: {task.get('id', 'UNKNOWN')}")
                    return None # Or skip this task
            return config['tasks']
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from {TASKS_JSON_PATH}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error reading tasks configuration {TASKS_JSON_PATH}: {e}", exc_info=True)
        return None

# --- Helper function to write tasks back to JSON ---
def write_tasks_config(tasks_list):
    """Safely writes the list of tasks back to tasks.json."""
    try:
        # Ensure the directory exists (though it should)
        os.makedirs(os.path.dirname(TASKS_JSON_PATH), exist_ok=True)
        with open(TASKS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump({"tasks": tasks_list}, f, indent=2) # Use indent for readability
        logger.info(f"Successfully updated {TASKS_JSON_PATH}")
        return True
    except Exception as e:
        logger.error(f"Error writing tasks configuration to {TASKS_JSON_PATH}: {e}", exc_info=True)
        return False
# --- End Write Helper ---

@flask_app.route('/tasks', methods=['GET'])
def get_tasks():
    """Endpoint to get the list of available tasks (full details)."""
    logger.debug(f"Received request for /tasks")
    tasks = read_tasks_config()
    if tasks is None:
        logger.info("No valid tasks found or tasks.json missing/invalid. Returning empty list.")
        return jsonify({"status": "success", "tasks": []}), 200

    # Return the full task details now
    logger.info(f"Returning {len(tasks)} tasks (full details) to frontend.")
    return jsonify({"status": "success", "tasks": tasks}), 200

@flask_app.route('/tasks', methods=['POST'])
def add_task():
    """Endpoint to add a new task."""
    logger.debug("Received request to POST /tasks")
    new_task_data = request.get_json()
    if not new_task_data:
        return jsonify({"status": "error", "message": "No data provided."}), 400

    # Basic validation of incoming data
    required_keys = ['id', 'name', 'markdownFiles']
    if not all(key in new_task_data for key in required_keys) or not isinstance(new_task_data['markdownFiles'], list):
        return jsonify({"status": "error", "message": "Missing required task data (id, name, markdownFiles as list)."}), 400
    if not isinstance(new_task_data['id'], str) or not new_task_data['id'].strip() or not re.match(r"^[a-zA-Z0-9_-]+$", new_task_data['id']):
        return jsonify({"status": "error", "message": "Invalid Task ID format (use letters, numbers, _, -)."}), 400
    if not isinstance(new_task_data['name'], str) or not new_task_data['name'].strip():
        return jsonify({"status": "error", "message": "Task Name cannot be empty."}), 400

    tasks = read_tasks_config()
    if tasks is None:
        tasks = [] # Start a new list if the file didn't exist or was invalid

    # Check for duplicate ID
    if any(task.get('id') == new_task_data['id'] for task in tasks):
        return jsonify({"status": "error", "message": f"Task ID '{new_task_data['id']}' already exists."}), 409 # Conflict

    # Add the new task (ensure description is handled, even if empty)
    task_to_add = {
        "id": new_task_data['id'],
        "name": new_task_data['name'],
        "description": new_task_data.get('description', ''), # Use .get for optional field
        "markdownFiles": new_task_data['markdownFiles']
    }
    tasks.append(task_to_add)

    if write_tasks_config(tasks):
        logger.info(f"Successfully added new task with ID: {new_task_data['id']}")
        return jsonify({"status": "success", "message": "Task added successfully.", "task": task_to_add}), 201 # Created
    else:
        return jsonify({"status": "error", "message": "Failed to write updated tasks configuration."}), 500

@flask_app.route('/tasks/<task_id>', methods=['PUT'])
def update_task(task_id):
    """Endpoint to update an existing task."""
    logger.debug(f"Received request to PUT /tasks/{task_id}")
    updated_task_data = request.get_json()
    if not updated_task_data:
        return jsonify({"status": "error", "message": "No data provided."}), 400

    # Basic validation
    required_keys = ['name', 'markdownFiles'] # ID is in URL, not body
    if not all(key in updated_task_data for key in required_keys) or not isinstance(updated_task_data['markdownFiles'], list):
        return jsonify({"status": "error", "message": "Missing required task data (name, markdownFiles as list)."}), 400
    if not isinstance(updated_task_data['name'], str) or not updated_task_data['name'].strip():
        return jsonify({"status": "error", "message": "Task Name cannot be empty."}), 400

    tasks = read_tasks_config()
    if tasks is None:
        return jsonify({"status": "error", "message": "Tasks configuration not found or invalid."}), 500

    task_index = -1
    for i, task in enumerate(tasks):
        if task.get('id') == task_id:
            task_index = i
            break

    if task_index == -1:
        return jsonify({"status": "error", "message": f"Task ID '{task_id}' not found."}), 404

    # Update the task
    tasks[task_index]["name"] = updated_task_data["name"]
    tasks[task_index]["description"] = updated_task_data.get("description", '')
    tasks[task_index]["markdownFiles"] = updated_task_data["markdownFiles"]

    if write_tasks_config(tasks):
        logger.info(f"Successfully updated task with ID: {task_id}")
        return jsonify({"status": "success", "message": "Task updated successfully.", "task": tasks[task_index]}), 200
    else:
        return jsonify({"status": "error", "message": "Failed to write updated tasks configuration."}), 500

@flask_app.route('/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Endpoint to delete a task."""
    logger.debug(f"Received request to DELETE /tasks/{task_id}")

    tasks = read_tasks_config()
    if tasks is None:
        return jsonify({"status": "error", "message": "Tasks configuration not found or invalid."}), 500

    initial_length = len(tasks)
    tasks = [task for task in tasks if task.get('id') != task_id]

    if len(tasks) == initial_length:
        return jsonify({"status": "error", "message": f"Task ID '{task_id}' not found."}), 404

    if write_tasks_config(tasks):
        logger.info(f"Successfully deleted task with ID: {task_id}")
        return jsonify({"status": "success", "message": "Task deleted successfully."}), 200
    else:
        return jsonify({"status": "error", "message": "Failed to write updated tasks configuration."}), 500

@flask_app.route('/tasks/<task_id>/content', methods=['GET'])
def get_task_content(task_id):
    """Endpoint to get the combined markdown content for a specific task."""
    logger.debug(f"Received request for /tasks/{task_id}/content")
    tasks = read_tasks_config()
    if tasks is None:
        logger.warning(f"Could not get task content: Tasks configuration is invalid or missing.")
        return jsonify({"status": "error", "message": "Tasks configuration not loaded."}), 500

    # Find the requested task
    task_definition = next((task for task in tasks if task.get('id') == task_id), None)

    if task_definition is None:
        logger.warning(f"Task with ID '{task_id}' not found in configuration.")
        return jsonify({"status": "error", "message": f"Task ID '{task_id}' not found."}), 404

    markdown_files = task_definition.get('markdownFiles', [])
    if not markdown_files:
        logger.info(f"Task '{task_id}' has no associated markdown files.")
        return jsonify({"status": "success", "content": ""}), 200 # Return empty content

    combined_content = []
    project_root = os.path.dirname(TASKS_JSON_PATH) # Directory where tasks.json resides
    files_read = 0
    files_missing = 0

    for relative_md_path in markdown_files:
        # Ensure the path is treated as relative to the project root
        absolute_md_path = os.path.abspath(os.path.join(project_root, relative_md_path))
        logger.debug(f"Attempting to read markdown file: {absolute_md_path}")
        if not os.path.exists(absolute_md_path):
            logger.warning(f"Markdown file not found for task '{task_id}': {absolute_md_path} (relative: {relative_md_path})")
            files_missing += 1
            combined_content.append(f"\n\n--- ERROR: File not found: {relative_md_path} ---\n\n") # Add error marker
            continue

        try:
            with open(absolute_md_path, 'r', encoding='utf-8') as f:
                content = f.read()
                combined_content.append(content)
                files_read += 1
        except Exception as e:
            logger.error(f"Error reading markdown file {absolute_md_path} for task '{task_id}': {e}", exc_info=True)
            files_missing += 1
            combined_content.append(f"\n\n--- ERROR: Could not read file: {relative_md_path} ({e}) ---\n\n")

    final_content = "\n\n---\n\n".join(combined_content).strip() # Join files with a separator

    if files_missing > 0:
        logger.warning(f"Task '{task_id}': Read {files_read} files successfully, but {files_missing} files were missing or unreadable.")
        # Decide whether to return partial content or an error. Returning partial content for now.
        return jsonify({"status": "success", "content": final_content}), 200 # Still success, but content has errors
    else:
        logger.info(f"Successfully read and combined {files_read} markdown files for task '{task_id}'.")
        return jsonify({"status": "success", "content": final_content}), 200

# --- End Task Endpoints ---

@flask_app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    message = data.get('message')
    if not message:
        return jsonify({"reply": "No message provided."}), 400
    if not loop or not loop.is_running():
        return jsonify({"reply": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(
        process_chat_async(message), loop)
    try:
        result, status_code = future.result(timeout=60)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error("Chat processing timed out.")
        return jsonify({"reply": "Error: Response timed out."}), 504
    except Exception as e:
        logger.error(
            f"Error getting result from chat future: {e}", exc_info=True)
        return jsonify({"reply": f"Error processing your request: {e}"}), 500


@flask_app.route('/servers', methods=['POST'])
def add_server():
    data = request.get_json()
    path = data.get('path')
    name = data.get('name')
    command = data.get('command')
    args = data.get('args') # Expecting a list

    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    if path:
        # Adding via Python script path
        future = asyncio.run_coroutine_threadsafe(add_server_async(path=path), loop)
        identifier_log = path
    elif name and command and isinstance(args, list):
        # Adding via command/args (e.g., from JSON)
        future = asyncio.run_coroutine_threadsafe(add_server_async(name=name, command=command, args=args), loop)
        identifier_log = name
    else:
        return jsonify({"status": "error", "message": "Invalid parameters. Provide either 'path' or 'name', 'command', and 'args'."}), 400

    try:
        result, status_code = future.result(timeout=30)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error(f"Adding server {identifier_log} timed out.")
        return jsonify({"status": "error", "message": "Error: Adding server timed out."}), 504
    except Exception as e:
        logger.error(
            f"Error getting result from add_server future for {identifier_log}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error adding server: {e}"}), 500


@flask_app.route('/servers', methods=['DELETE'])
def delete_server():
    data = request.get_json()
    identifier = data.get('identifier') # Expect 'identifier' instead of 'path'
    if not identifier:
        return jsonify({"status": "error", "message": "No server identifier provided for deletion."}), 400
    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(
        disconnect_server_async(identifier), loop) # Pass identifier
    try:
        result, status_code = future.result(timeout=30)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error(f"Disconnecting server {identifier} timed out.")
        return jsonify({"status": "error", "message": "Error: Disconnecting server timed out."}), 504
    except Exception as e:
        logger.error(
            f"Error getting result from delete_server future for {identifier}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error disconnecting server: {e}"}), 500


@flask_app.route('/servers', methods=['GET'])
def get_servers():
    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(get_servers_async(), loop)
    try:
        result, status_code = future.result(timeout=10)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error("Getting servers timed out.")
        return jsonify({"status": "error", "message": "Error: Getting server list timed out."}), 504
    except Exception as e:
        logger.error(
            f"Error getting result from get_servers future: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error getting servers: {e}"}), 500


@flask_app.route('/set-api-key', methods=['POST'])
def set_api_key():
    data = request.get_json()
    api_key = data.get('apiKey')
    if not api_key:
        return jsonify({"status": "error", "message": "No API key provided."}), 400
    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(set_api_key_async(api_key), loop)
    try:
        result, status_code = future.result(
            timeout=20)  # Timeout for re-initialization
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error("Setting API key timed out.")
        return jsonify({"status": "error", "message": "Error: Setting API key timed out."}), 504
    except Exception as e:
        logger.error(
            f"Error getting result from set_api_key future: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error setting API key: {e}"}), 500

# --- Model Switching Endpoints ---
@flask_app.route('/set-model', methods=['POST'])
def set_model():
    data = request.get_json()
    model_name = data.get('model')
    if not model_name:
        return jsonify({"status": "error", "message": "No model name provided."}), 400
    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(set_model_async(model_name), loop)
    try:
        result, status_code = future.result(timeout=10)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error(f"Setting model to {model_name} timed out.")
        return jsonify({"status": "error", "message": "Error: Setting model timed out."}), 504
    except Exception as e:
        logger.error(f"Error getting result from set_model future: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error setting model: {e}"}), 500

@flask_app.route('/get-model', methods=['GET'])
def get_model():
    if not loop or not loop.is_running():
        return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    future = asyncio.run_coroutine_threadsafe(get_model_async(), loop)
    try:
        result, status_code = future.result(timeout=5)
        return jsonify(result), status_code
    except asyncio.TimeoutError:
        logger.error("Getting current model timed out.")
        return jsonify({"status": "error", "message": "Error: Getting current model timed out."}), 504
    except Exception as e:
        logger.error(f"Error getting result from get_model future: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error getting current model: {e}"}), 500

@flask_app.route('/list-models', methods=['GET'])
def list_models():
    if not loop or not loop.is_running():
        # Allow listing even if loop isn't fully ready, as list is static
        pass
        # return jsonify({"status": "error", "message": "Backend loop not running."}), 500

    # Run directly if loop isn't ready, otherwise use threadsafe call
    if loop and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(list_models_async(), loop)
        try:
            result, status_code = future.result(timeout=5)
            return jsonify(result), status_code
        except asyncio.TimeoutError:
            logger.error("Listing models timed out.")
            return jsonify({"status": "error", "message": "Error: Listing models timed out."}), 504
        except Exception as e:
            logger.error(f"Error getting result from list_models future: {e}", exc_info=True)
            return jsonify({"status": "error", "message": f"Error listing models: {e}"}), 500
    else:
        # Fallback for when loop isn't running (e.g., during startup errors)
        try:
            temp_app = MCPChatApp()
            models = temp_app.get_available_models()
            return jsonify({"status": "success", "models": models}), 200
        except Exception as e:
            logger.error(f"Error listing models directly (no loop): {e}", exc_info=True)
            return jsonify({"status": "error", "message": f"Error listing models: {e}"}), 500
# --- End Model Switching Endpoints ---

# --- Markdown File Content Endpoints ---

@flask_app.route('/markdown-file-content', methods=['GET'])
def get_markdown_content():
    """Reads and returns the content of a specific markdown file."""
    relative_path = request.args.get('path')
    if not relative_path:
        return jsonify({"status": "error", "message": "Missing 'path' query parameter."}), 400

    project_root = os.path.dirname(TASKS_JSON_PATH)
    # Basic security: Ensure the path is relative and within the project root
    try:
        absolute_path = os.path.abspath(os.path.join(project_root, relative_path))
        if not absolute_path.startswith(os.path.abspath(project_root)):
            logger.warning(f"Attempted to access file outside project root: {relative_path}")
            return jsonify({"status": "error", "message": "Access denied: Path is outside allowed directory."} ), 403 # Forbidden

        if not os.path.exists(absolute_path):
            logger.warning(f"Markdown file not found for GET: {absolute_path} (relative: {relative_path})")
            # Return empty content for non-existent file, allowing frontend to handle it
            return jsonify({"status": "success", "content": ""}), 200
            # Or return 404:
            # return jsonify({"status": "error", "message": "File not found."}), 404

        logger.info(f"Reading content for: {relative_path}")
        with open(absolute_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({"status": "success", "content": content}), 200

    except Exception as e:
        logger.error(f"Error reading markdown file {relative_path}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error reading file: {e}"}), 500

@flask_app.route('/markdown-file-content', methods=['PUT'])
def update_markdown_content():
    """Updates the content of a specific markdown file."""
    relative_path = request.args.get('path')
    if not relative_path:
        return jsonify({"status": "error", "message": "Missing 'path' query parameter."}), 400

    data = request.get_json()
    if data is None or 'content' not in data:
        return jsonify({"status": "error", "message": "Missing 'content' in request body."}), 400
    content = data['content']

    project_root = os.path.dirname(TASKS_JSON_PATH)
    # Basic security: Ensure the path is relative and within the project root
    try:
        absolute_path = os.path.abspath(os.path.join(project_root, relative_path))
        if not absolute_path.startswith(os.path.abspath(project_root)):
            logger.warning(f"Attempted to write file outside project root: {relative_path}")
            return jsonify({"status": "error", "message": "Access denied: Path is outside allowed directory."} ), 403 # Forbidden

        # Ensure the directory exists before writing
        os.makedirs(os.path.dirname(absolute_path), exist_ok=True)

        logger.info(f"Writing content to: {relative_path}")
        with open(absolute_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({"status": "success", "message": "File updated successfully."}), 200

    except Exception as e:
        logger.error(f"Error writing markdown file {relative_path}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error writing file: {e}"}), 500

# --- End Markdown File Content Endpoints ---

# --- File Import Endpoint ---
@flask_app.route('/import-markdown-file', methods=['POST'])
def import_markdown_file():
    """Copies an external markdown file into the project's tasks_md folder."""
    data = request.get_json()
    absolute_source_path = data.get('sourcePath')
    if not absolute_source_path:
        return jsonify({"status": "error", "message": "Missing 'sourcePath' in request body."}), 400

    # Basic validation: check if source file exists and is a .md file
    if not os.path.exists(absolute_source_path) or not absolute_source_path.lower().endswith('.md'):
        return jsonify({"status": "error", "message": "Source file does not exist or is not a markdown file."}), 400

    project_root = os.path.dirname(TASKS_JSON_PATH)
    # Define a subfolder for imported files (relative to project root)
    # Make sure this folder exists or is created
    imported_folder_rel = os.path.join("tasks_md", "imported")
    imported_folder_abs = os.path.join(project_root, imported_folder_rel)
    os.makedirs(imported_folder_abs, exist_ok=True)

    # Create a safe destination filename (e.g., using base name)
    # Add simple mechanism to avoid overwriting - append number if exists
    base_filename = os.path.basename(absolute_source_path)
    destination_filename_base, destination_filename_ext = os.path.splitext(base_filename)
    counter = 0
    destination_filename = base_filename
    destination_path_rel = os.path.join(imported_folder_rel, destination_filename)
    destination_path_abs = os.path.join(imported_folder_abs, destination_filename)

    while os.path.exists(destination_path_abs):
        counter += 1
        destination_filename = f"{destination_filename_base}_{counter}{destination_filename_ext}"
        destination_path_rel = os.path.join(imported_folder_rel, destination_filename)
        destination_path_abs = os.path.join(imported_folder_abs, destination_filename)

    try:
        # Copy the file content
        logger.info(f"Importing file from {absolute_source_path} to {destination_path_rel}")
        with open(absolute_source_path, 'r', encoding='utf-8') as infile, \
             open(destination_path_abs, 'w', encoding='utf-8') as outfile:
            outfile.write(infile.read())

        # Return the NEW RELATIVE path
        # Normalize path separators for consistency (e.g., use forward slashes)
        normalized_rel_path = destination_path_rel.replace('\\', '/')
        return jsonify({"status": "success", "relativePath": normalized_rel_path}), 200

    except Exception as e:
        logger.error(f"Error importing file from {absolute_source_path} to {destination_path_rel}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error importing file: {e}"}), 500
# --- End File Import Endpoint ---

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MCP Gemini Flask Backend')
    parser.add_argument('--port', type=int, default=5001,
                        help='Port to run the backend on')
    args = parser.parse_args()

    thread = threading.Thread(target=start_async_loop, daemon=True)
    thread.start()

    if not loop_ready.wait(timeout=10):
        logger.error("Asyncio loop did not start within timeout.")
        sys.exit(1)

    if loop:
        init_future = asyncio.run_coroutine_threadsafe(
            initialize_chat_app(), loop)
        try:
            init_future.result(timeout=20)
            if chat_app is None:
                logger.error("Chat app initialization returned None.")
                sys.exit(1)
            logger.info("Chat app initialized successfully via asyncio loop.")
        except Exception as e:
            logger.error(
                f"Error during chat app initialization: {e}", exc_info=True)
            # Don't exit if init fails due to no key, allow setting it later
            logger.warning(
                "Initial Gemini initialization failed, likely no API key. Waiting for key to be set.")
            # chat_app will still be None if it failed badly
            if chat_app is None:
                chat_app = MCPChatApp()  # Create instance even if init fails
                logger.info(
                    "Created MCPChatApp instance despite initial Gemini failure.")

    else:
        logger.error("Asyncio loop not available after waiting.")
        sys.exit(1)

    logger.info(f"Starting Flask server on 127.0.0.1:{args.port}")
    flask_app.run(host='127.0.0.1', port=args.port)
