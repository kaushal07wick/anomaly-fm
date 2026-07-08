// Implementing theme changer and improving dial knob functionality

// Modify the code to safely access the document
if (typeof document !== 'undefined') {
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        setTheme(selectedTheme);
    });
}

const setTheme = (theme) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark'); // Remove existing themes
    root.classList.add(theme); // Add the new selected theme
};

// Improving the dial knob functionality
const knob = document.querySelector('.knob');
const smoothKnob = () => {
    knob.style.transition = 'transform 0.1s ease-in-out'; // Add smooth transition
};

const init = () => {
    knob.addEventListener('mousedown', smoothKnob); // Make the knob smoother
};

document.addEventListener('DOMContentLoaded', init);