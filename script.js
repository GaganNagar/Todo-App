// Import necessary functions from Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIG & INITIALIZATION ---

// These global variables are provided by the environment.
// They connect the app to the correct Firebase project and user.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-todo-app';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// App state variables
let app, auth, db, userId;
let tasks = [];
let currentFilter = 'all';
let unsubscribeFromTasks; // To hold the onSnapshot listener for real-time updates

// --- DOM ELEMENTS ---
const taskForm = document.getElementById('add-task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const filterButtons = document.getElementById('filter-buttons');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const userIdDisplay = document.getElementById('user-id-display');

// --- FIREBASE SETUP & AUTHENTICATION ---

/**
 * Initializes the Firebase app and sets up authentication.
 */
async function setupFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Listen for changes in authentication state
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                // Once authenticated, start listening for tasks from Firestore
                listenForTasks();
            } else {
                // If no user is signed in, attempt to sign in.
                signInUser();
            }
        });
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        loadingState.textContent = "Error connecting to the service.";
    }
}

/**
 * Signs the user in, either with a provided token or anonymously.
 */
async function signInUser() {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Authentication failed:", error);
        loadingState.textContent = "Could not authenticate.";
    }
}

// --- DATA HANDLING (FIRESTORE) ---

/**
 * Gets a reference to the user's private task collection in Firestore.
 * @returns {import("firebase/firestore").CollectionReference} A reference to the collection.
 */
function getTasksCollectionRef() {
    // This path ensures data is stored privately for each user of this specific app instance.
    return collection(db, `artifacts/${appId}/users/${userId}/tasks`);
}

/**
 * Sets up a real-time listener for tasks in Firestore.
 */
function listenForTasks() {
    if (unsubscribeFromTasks) {
        unsubscribeFromTasks(); // Unsubscribe from any previous listener
    }
    const tasksCollection = getTasksCollectionRef();
    unsubscribeFromTasks = onSnapshot(tasksCollection, (snapshot) => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort tasks by creation time to keep them in a consistent order
        tasks.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        renderTasks(); // Re-render the list whenever data changes
    }, (error) => {
        console.error("Error listening to tasks:", error);
        loadingState.textContent = "Error fetching tasks.";
    });
}

/**
 * Adds a new task to Firestore.
 * @param {string} text - The content of the task.
 */
async function addTask(text) {
    if (!text.trim()) return; // Don't add empty tasks
    try {
        await addDoc(getTasksCollectionRef(), {
            text: text,
            completed: false,
            createdAt: new Date() // Use server timestamp for consistency
        });
    } catch (error) {
        console.error("Error adding task:", error);
    }
}

/**
 * Toggles the 'completed' status of a task in Firestore.
 * @param {string} taskId - The ID of the task to update.
 * @param {boolean} currentStatus - The current 'completed' status of the task.
 */
async function toggleTaskCompleted(taskId, currentStatus) {
    const taskRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, taskId);
    try {
        await updateDoc(taskRef, {
            completed: !currentStatus
        });
    } catch (error) {
        console.error("Error updating task:", error);
    }
}

/**
 * Deletes a task from Firestore.
 * @param {string} taskId - The ID of the task to delete.
 */
async function deleteTask(taskId) {
    const taskRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, taskId);
    try {
        await deleteDoc(taskRef);
    } catch (error) {
        console.error("Error deleting task:", error);
    }
}

/**
 * Deletes all completed tasks from Firestore in a single batch operation.
 */
async function clearCompletedTasks() {
    const batch = writeBatch(db);
    const completedTasks = tasks.filter(task => task.completed);
    
    if (completedTasks.length === 0) return;

    completedTasks.forEach(task => {
        const taskRef = doc(db, `artifacts/${appId}/users/${userId}/tasks`, task.id);
        batch.delete(taskRef);
    });

    try {
        await batch.commit();
    } catch (error)
    {
        console.error("Error clearing completed tasks:", error);
    }
}

// --- UI RENDERING ---

/**
 * Renders the tasks to the DOM based on the current filter.
 */
function renderTasks() {
    taskList.innerHTML = '';
    loadingState.classList.add('hidden');

    const filteredTasks = tasks.filter(task => {
        if (currentFilter === 'all') return true;
        if (currentFilter === 'active') return !task.completed;
        if (currentFilter === 'completed') return task.completed;
        return true;
    });

    if (tasks.length === 0) {
         emptyState.classList.remove('hidden');
    } else {
         emptyState.classList.add('hidden');
    }

    if (filteredTasks.length === 0 && tasks.length > 0) {
        const noTasksMessage = document.createElement('p');
        noTasksMessage.className = 'text-center text-gray-400 py-4';
        noTasksMessage.textContent = `No ${currentFilter} tasks.`;
        taskList.appendChild(noTasksMessage);
    } else {
         filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item flex items-center justify-between bg-gray-700/50 p-3 rounded-lg';
            li.dataset.id = task.id;

            const textClass = task.completed ? 'completed-task' : 'text-white';

            li.innerHTML = `
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} class="h-5 w-5 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-600 cursor-pointer flex-shrink-0">
                    <span class="flex-1 ${textClass} truncate">${task.text}</span>
                </div>
                <button class="delete-btn text-gray-500 hover:text-red-500 transition-colors p-1 rounded-full flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            `;

            // Add event listeners for checkbox and delete button
            li.querySelector('input[type="checkbox"]').addEventListener('change', () => {
                toggleTaskCompleted(task.id, task.completed);
            });
            li.querySelector('.delete-btn').addEventListener('click', () => {
                deleteTask(task.id);
            });

            taskList.appendChild(li);
        });
    }
}

// --- EVENT LISTENERS ---

// Handle new task submission
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addTask(taskInput.value);
    taskInput.value = '';
});

// Handle filter button clicks
filterButtons.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const filter = e.target.dataset.filter;
        if (filter) {
            currentFilter = filter;
            // Update active button style
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            renderTasks();
        }
    }
});

// Handle 'Clear Completed' button click
clearCompletedBtn.addEventListener('click', clearCompletedTasks);

// --- INITIALIZATION ---
// Start the application once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', setupFirebase);
