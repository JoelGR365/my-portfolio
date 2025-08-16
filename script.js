const textArray = [
  "Welcome to my IT Portfolio",
  "I’m Joel, IT Infrastructure Specialist",
  "Automation • Networking • Monitoring • Security"
];

let i = 0;
let j = 0;
let currentText = "";
let isDeleting = false;

function type() {
  currentText = textArray[i];
  let display = currentText.substring(0, j);
  document.getElementById("typewriter").textContent = display;

  if (!isDeleting && j < currentText.length) {
    j++;
    setTimeout(type, 100);
  } else if (isDeleting && j > 0) {
    j--;
    setTimeout(type, 50);
  } else {
    isDeleting = !isDeleting;
    if (!isDeleting) {
      i = (i + 1) % textArray.length;
    }
    setTimeout(type, 1000);
  }
}

type();
