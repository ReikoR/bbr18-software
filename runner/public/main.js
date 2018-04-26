let socket = new WebSocket('ws://' + location.host);

socket.addEventListener('message', function (event) {
    console.log(event.data);
});

fetchComponents();

const state = {
    components: {}
};

function fetchComponents() {
    fetch('/components').then(function (response) {
        return response.json();
    }).then(function (data) {
        console.log(data);
        updateComponents(data);
    });
}

function updateComponents(componentsInfo) {
    for (let id in componentsInfo) {
        const componentInfo = componentsInfo[id];

        state.components[id] = state.components[id] || {};

        for (let key in componentInfo) {
            state.components[id][key] = componentInfo[key];
        }
    }

    renderComponents(state.components);
}

function renderComponents(components) {
    const elComponents = document.querySelector('#components');

    for (let id in components) {
        const component = components[id];

        if (!component.ui) {
            component.ui = {
                container: document.createElement('div'),
                header: document.createElement('div'),
                content: document.createElement('div'),
                name: document.createElement('div'),
                startButton: document.createElement('button'),
                loadConfButton: document.createElement('button'),
                saveConfButton: document.createElement('button'),
                confTextArea: document.createElement('div')
            };

            const {
                container,
                header,
                content,
                name,
                startButton,
                loadConfButton,
                saveConfButton,
                confTextArea
            } = component.ui;

            container.classList.add('component');
            header.classList.add('component-header');
            content.classList.add('component-content');
            name.classList.add('component-name');
            confTextArea.classList.add('component-conf');

            confTextArea.setAttribute('contenteditable', '');

            name.innerText = component.name;

            loadConfButton.innerText = 'Load';
            saveConfButton.innerText = 'Save';

            header.appendChild(startButton);
            header.appendChild(name);
            header.appendChild(loadConfButton);
            header.appendChild(saveConfButton);
            content.appendChild(confTextArea);

            container.appendChild(header);
            container.appendChild(content);

            elComponents.appendChild(container);

            loadConfButton.addEventListener('click', function () {
                fetch('/conf/' + id).then(function (response) {
                    return response.json();
                }).then(function (data) {
                    confTextArea.innerText = JSON.stringify(data, null, 2);
                });
            });

            saveConfButton.addEventListener('click', function () {
                fetch('/conf/' + id, {
                    body: confTextArea.innerText,
                    headers: {'content-type': 'application/json'},
                    method: 'PUT'
                }).then(function (response) {
                    console.log(response);
                });
            });

            startButton.addEventListener('click', function () {
                if (component.isRunning) {
                    fetch('/stop/' + id).then(function (response) {
                        console.log(response.body);
                        fetchComponents();
                    });
                } else {
                    fetch('/start/' + id).then(function (response) {
                        console.log(response.body);
                        fetchComponents();
                    });
                }
            });
        }

        component.ui.startButton.innerText = component.isRunning ? 'Stop' : 'Start';
    }
}