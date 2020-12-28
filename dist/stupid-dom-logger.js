// const toast = 'https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/js/toastr.min.js';
// const toast_styles = 'cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/js/toastr.min.css';

let toasts = {};
let toastParent;
let styles;

function proxy(context, method) {
    return function () {
        toast(method.name, arguments);
        method.apply(context, arguments)
    }
}

console.log = proxy(console, console.log);
console.info = proxy(console, console.info);
console.debug = proxy(console, console.debug);
console.warn = proxy(console, console.warn);
console.error = proxy(console, console.error);

function toast(level, message) {
    let temp = document.createElement('div');
    let closeButton = document.createElement('button');

    closeButton.addEventListener('click', (ev) => {
        const id = Number(ev.target.parentElement.id);
        const ele = toasts[id];
        toastParent.removeChild(ele);

        delete toasts[id];
    });

    closeButton.textContent = 'X';

    temp.textContent = stringify(message[0]);
    temp.appendChild(closeButton);
    temp.id = Object.keys(toasts).length;

    switch (level) {
        case "debug":
            temp.style.backgroundColor = 'blue';
            temp.style.color = 'white';
            break;
        case "warn":
            temp.style.backgroundColor = 'yellow';
            break;
        case "log":
        case "info":
            temp.style.backgroundColor = 'lightgrey';

            break;
        case "error":
            temp.style.backgroundColor = 'red';
            temp.style.color = 'white';
            break;
        default:
    }

    toasts[temp.id] = temp;
    toastParent.appendChild(temp);
}

/**
 * Source: https://gist.github.com/KaptajnKold/1000978
 */
function indent (s, padding) {
	return s.split("\n").map(function (s) {return (padding || "\t") + s;}).join("\n");
}

/**
 * Source: https://gist.github.com/KaptajnKold/1000978
 */
function stringify (anything) {
	var p, key_values = [];
	if (anything instanceof Array) {
		return "[" + anything.map(stringify).join(", ") + "]";
	}
	if (anything instanceof Date) {
		return anything.toString();
	}
	if (typeof anything === "object") {
		for (p in anything) {
			if (anything.hasOwnProperty(p)) {
				key_values.push(p + ": " + stringify(anything[p]));
			}
		}
		return "{\n" + indent(key_values.join(",\n"), "    ") + "\n}";
	}
	if (typeof anything === "string") {
		return '"' + anything + '"';
	}
	return anything.toString();
}

window.onload = () => {
    toastParent = document.createElement('div');
    styles = document.createElement('style');
    styles.type = 'text/css';
    styles.innerHTML = `
        #toast-parent {
            position: absolute;
            top: 0;
            right: 0;
            min-height: 100vh;
            margin: 0.5rem;
            max-width: 300px;
        }

        #toast-parent > * {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 1rem;
            font-size: 16px;
            font-family: monospace;
            opacity: 0;
            position: relative;
            margin: 0.5rem 0;
            min-height: 25px;
            width: 250px;
            border-radius: 8px;
            transition: all 0.3s ease;
            animation: insert 0.3s ease forwards;
        }

        @keyframes insert {
            from {
                opacity: 0;
            }
            to {
                opacity: 0.75;
            }
        }

        #toast-parent button {
            cursor: pointer;
            height: 25px;
            width: 25px;
        }
    `;
    toastParent.id = 'toast-parent';

    document.head.appendChild(styles);
    document.body.appendChild(toastParent);
}