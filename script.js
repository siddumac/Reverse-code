let currentPage = 0;

const pages = [
  // ---------- BASIC ----------
  { title: "BASIC-1", 
    question: "Check if a string is a palindrome.\n\nInput: madam\nOutput: YES\n\nInput: hello\nOutput: NO",
    code: ``
  },

  { title: "BASIC-2", 
    question: "Find the maximum element in an array.\n\nInput: [1, 7, 3, 9, 2]\nOutput: 9",
    code: ``
  },

  { title: "BASIC-3", 
    question: "Check if a number is an Armstrong number.\n\nInput: 153\nOutput: YES\n\nInput: 123\nOutput: NO",
    code: ``
  },

  { title: "BASIC-4", 
    question: "Find the GCD (Greatest Common Divisor) of two numbers.\n\nInput: 12 18\nOutput: 6",
    code: ``
  },

  { title: "BASIC-5", 
    question: "Find the Nth term of the Fibonacci sequence.\n\nInput: 6\nOutput: 8",
    code: ``
  },

  // ---------- INTERMEDIATE ----------
  { title: "INTERMEDIATE-1", 
    question: "Print a number pyramid.\n\nInput: 5\nOutput:\n1\n1 2\n1 2 3\n1 2 3 4\n1 2 3 4 5",
    code: ``
  },

  { title: "INTERMEDIATE-2", 
    question: "Print a right-aligned star triangle.\n\nInput: 4\nOutput:\n   *\n  **\n ***\n****",
    code: ``
  },

  { title: "INTERMEDIATE-3", 
    question: "Print a diamond pattern of stars.\n\nInput: 3\nOutput:\n  *\n ***\n*****\n ***\n  *",
    code: ``
  },

  // ---------- ADVANCED ----------
  { title: "INTERMEDIATE-4", 
    question: "Print Pascal’s Triangle.\n\nInput: 5\nOutput:\n1\n1 1\n1 2 1\n1 3 3 1\n1 4 6 4 1",
    code: ``
  },

  { title: "INTERMEDIATE-5", 
    question: "Print a spiral matrix of size N x N.\n\nInput: 3\nOutput:\n1 2 3\n8 9 4\n7 6 5",
    code: ``
  }
];

// ---------- FUNCTIONS ----------
function loadPage(index) {
  const page = pages[index];
  document.getElementById("page-title").textContent = page.title;
  document.getElementById("questions-list").textContent = page.question;
  document.getElementById("editor").value = page.code || "";
}

function nextPage() {
  currentPage = (currentPage + 1) % pages.length;
  loadPage(currentPage);
}

function prevPage() {
  currentPage = (currentPage - 1 + pages.length) % pages.length;
  loadPage(currentPage);
}

async function runCode() {
  const code = document.getElementById("editor").value;
  const language = document.getElementById("language-select").value;
  document.getElementById("output").textContent = "Running code...";

  try {
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: language,
        version: "*",
        files: [{ name: "main." + language, content: code }]
      })
    });

    const result = await response.json();
    if (result.run && result.run.output) {
      document.getElementById("output").innerHTML = `<span class="success">${result.run.output}</span>`;
    } else {
      document.getElementById("output").innerHTML = `<span class="error">Error:\n${JSON.stringify(result)}</span>`;
    }
  } catch (err) {
    document.getElementById("output").innerHTML = `<span class="error">Network Error:\n${err}</span>`;
  }
}

// ---------- SAVE CODE PER PAGE ----------
document.getElementById("editor").addEventListener("input", function() {
  pages[currentPage].code = this.value;

  // optional persistence in localStorage
  localStorage.setItem("savedPages", JSON.stringify(pages));
});

// ---------- LOAD FROM STORAGE (if available) ----------
const saved = localStorage.getItem("savedPages");
if (saved) {
  const parsed = JSON.parse(saved);
  for (let i = 0; i < pages.length; i++) {
    if (parsed[i] && typeof parsed[i].code === "string") {
      pages[i].code = parsed[i].code;
    }
  }
}

// load first page
loadPage(currentPage);
