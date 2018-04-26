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
                name: document.createElement('div'),
                startButton: document.createElement('button')
            };

            const { container, name, startButton } = component.ui;

            container.classList.add('component');
            name.classList.add('component-name');

            name.innerText = component.name;

            container.classList.add('component');
            name.classList.add('component-name');

            container.appendChild(startButton);
            container.appendChild(name);

            elComponents.appendChild(container);

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