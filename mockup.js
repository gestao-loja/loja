

import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('three-container');

let scene, camera, renderer, controls, currentProduct, mainLight;

let bgTexture = null;

const state = {

    product: 'mug',

    colors: {

        handle: '#ffffff',

        interior: '#ffffff',

        artArea: '#ffffff',

        base: '#ffffff',

        other: '#ffffff'

    },

    artTexture: null,

    artScale: 1.0,

    artRotation: 0,

    bgColor: '#e2d4c3',

    magicMugMode: false,

    magicRevealProgress: 0,

    magicAnimating: false,

    magicBodyMaterial: null,

    magicArtMaterial: null,

    magicArtAreaMaterial: null,

    magicAnimationSpeed: 0.0035

};

/* ============ INICIALIZAÇÃO THREE.JS ============ */

function initThree() {

    scene = new THREE.Scene();

    scene.background = new THREE.Color(state.bgColor);

    camera = new THREE.PerspectiveCamera(

        45,

        container.clientWidth / container.clientHeight,

        0.1,

        1000

    );

    camera.position.set(0, 1.2, 4.5);

    renderer = new THREE.WebGLRenderer({

        antialias: true,

        preserveDrawingBuffer: true

    });

    renderer.setSize(

        container.clientWidth,

        container.clientHeight

    );

    renderer.setPixelRatio(

        Math.min(window.devicePixelRatio, 2)

    );

    renderer.shadowMap.enabled = true;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;

    controls.dampingFactor = 0.05;

    controls.target.set(0, 0, 0);

    controls.minDistance = 2;

    controls.maxDistance = 10;

    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    scene.add(

        new THREE.AmbientLight(0xffffff, 0.8)

    );

    mainLight = new THREE.DirectionalLight(0xffffff, 2.0);

    mainLight.position.set(3, 5, 4);

    mainLight.castShadow = true;

    mainLight.shadow.mapSize.width = 1024;

    mainLight.shadow.mapSize.height = 1024;

    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(

        0xffffff,

        0.6

    );

    fillLight.position.set(-4, 2, -3);

    scene.add(fillLight);

    const groundGeo = new THREE.PlaneGeometry(20, 20);

    const groundMat = new THREE.ShadowMaterial({

        opacity: 0.15

    });

    const ground = new THREE.Mesh(groundGeo, groundMat);

    ground.rotation.x = -Math.PI / 2;

    ground.position.y = -1.01;

    ground.receiveShadow = true;

    scene.add(ground);

    buildProduct(state.product);

    animate();

}

function animate() {

    requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) return;

    if (controls) controls.update();

    updateMagicMugEffect();

    renderer.render(scene, camera);

}

/* ============ ALÇA DA CANECA ============ */

function createHandle() {

    const handleGroup = new THREE.Group();

    const path = new THREE.CatmullRomCurve3([

        new THREE.Vector3(0.78, 0.64, 0),

        new THREE.Vector3(1.08, 0.65, 0),

        new THREE.Vector3(1.38, 0.54, 0),

        new THREE.Vector3(1.56, 0.32, 0),

        new THREE.Vector3(1.61, 0.00, 0),

        new THREE.Vector3(1.56, -0.32, 0),

        new THREE.Vector3(1.38, -0.54, 0),

        new THREE.Vector3(1.08, -0.65, 0),

        new THREE.Vector3(0.78, -0.64, 0)

    ], false, 'centripetal', 0.35);

    const tubeGeo = new THREE.TubeGeometry(

        path, 96, 0.115, 24, false

    );

    tubeGeo.scale(1, 1, 0.78);

    const handleMaterial = new THREE.MeshStandardMaterial({

        color: state.magicMugMode

            ? '#171717'

            : state.colors.handle,

        roughness: 0.19,

        metalness: 0,

        side: THREE.DoubleSide

    });

    const handleMesh = new THREE.Mesh(

        tubeGeo,

        handleMaterial

    );

    handleMesh.castShadow = true;

    handleMesh.receiveShadow = true;

    handleGroup.add(handleMesh);

    const jointGeo = new THREE.SphereGeometry(

        0.125, 24, 20

    );

    const topJoint = new THREE.Mesh(

        jointGeo,

        handleMaterial

    );

    topJoint.position.set(0.79, 0.635, 0);

    topJoint.scale.set(1.15, 0.92, 0.78);

    topJoint.castShadow = true;

    topJoint.receiveShadow = true;

    handleGroup.add(topJoint);

    const bottomJoint = new THREE.Mesh(

        jointGeo,

        handleMaterial

    );

    bottomJoint.position.set(0.79, -0.635, 0);

    bottomJoint.scale.set(1.15, 0.92, 0.78);

    bottomJoint.castShadow = true;

    bottomJoint.receiveShadow = true;

    handleGroup.add(bottomJoint);

    return handleGroup;

}

/* ============ SHADER: REVELAÇÃO VERTICAL ============ */

function configurarRevelacaoVertical(material) {
    if (!material) return;

    material.transparent = true;
    material.depthWrite = false;

    material.userData.revealProgress = state.magicRevealProgress;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uReveal = {
            value: material.userData.revealProgress
        };

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
             varying vec2 vMagicUv;`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_vertex>',
            `#include <uv_vertex>
             vMagicUv = uv;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
             varying vec2 vMagicUv;
             uniform float uReveal;`
        );

        // UV.y cresce da base (0) ao topo (1) no CylinderGeometry.
        // A arte aparece de baixo para cima, com borda suavizada.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
             float revealEdge = 0.045;
             float revealAlpha = 0.0;

             if (uReveal >= 0.999) {
                 revealAlpha = 1.0;
             } else if (uReveal > 0.0) {
                 revealAlpha = 1.0 - smoothstep(
                     max(0.0, uReveal - revealEdge),
                     min(1.0, uReveal + revealEdge),
                     vMagicUv.y
                 );
             }

             diffuseColor.a *= revealAlpha;`
        );

        material.userData.revealShader = shader;
    };

    material.customProgramCacheKey = () =>
        'magic-mug-bottom-up-soft-reveal-v2';

    material.needsUpdate = true;
}

function atualizarShaderRevelacao(material, progress) {

    if (!material) return;

    material.userData.revealProgress = progress;

    const shader = material.userData.revealShader;

    if (shader && shader.uniforms.uReveal) {

        shader.uniforms.uReveal.value = progress;

    }

}

/* ============ CRIAÇÃO DOS PRODUTOS 3D ============ */

function buildProduct(type) {

    if (currentProduct) {

        scene.remove(currentProduct);

        currentProduct.traverse((child) => {

            if (!child.isMesh) return;

            child.geometry.dispose();

            if (Array.isArray(child.material)) {

                child.material.forEach(m => m.dispose());

            } else {

                child.material.dispose();

            }

        });

    }

    const group = new THREE.Group();

    let geometry;

    let mesh;

    const coldColor = new THREE.Color('#171717');

    const normalColor = new THREE.Color(state.colors.other);

    const initialBodyColor =

        type === 'mug' && state.magicMugMode

            ? coldColor.clone().lerp(

                normalColor,

                state.magicRevealProgress

            )

            : normalColor;

    const materialOther = new THREE.MeshStandardMaterial({

        color: initialBodyColor,

        roughness: 0.25,

        metalness: 0.1,

        side: THREE.DoubleSide

    });

    state.magicBodyMaterial =

        type === 'mug' ? materialOther : null;

    const materialInterior = new THREE.MeshStandardMaterial({

        color: state.colors.interior,

        roughness: 0.25,

        metalness: 0.1,

        side: THREE.DoubleSide

    });

    const materialBase = new THREE.MeshStandardMaterial({

        color: state.colors.base,

        roughness: 0.25,

        metalness: 0.1,

        side: THREE.DoubleSide

    });

    const initialArtAreaColor =

        type === 'mug' && state.magicMugMode

            ? initialBodyColor

            : new THREE.Color(state.colors.artArea);

    const materialArtArea = new THREE.MeshStandardMaterial({

        color: initialArtAreaColor,

        roughness: 0.25,

        metalness: 0.1,

        side: THREE.DoubleSide

    });

    state.magicArtAreaMaterial =

        type === 'mug' ? materialArtArea : null;

    let artMaterial = null;

    if (state.artTexture) {

        artMaterial = new THREE.MeshStandardMaterial({

            map: state.artTexture,

            color: 0xffffff,

            roughness: 0.25,

            metalness: 0.1,

            transparent: true,

            opacity: 1,

            side: THREE.DoubleSide,

            blending: THREE.NormalBlending,

            depthWrite: !state.magicMugMode

        });

        if (type === 'mug' && state.magicMugMode) {

            configurarRevelacaoVertical(artMaterial);

        }

    }

    state.magicArtMaterial =

        type === 'mug' ? artMaterial : null;

    switch (type) {

        case 'mug': {

            // Corpo externo da caneca

            geometry = new THREE.CylinderGeometry(

                1.0, 0.9, 2.0, 64, 64, true

            );

            mesh = new THREE.Mesh(geometry, materialOther);

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            group.add(mesh);

            // Paredes internas

            const innerWallGeo = new THREE.CylinderGeometry(

                0.965, 0.865, 1.94, 96, 32, true

            );

            const innerWall = new THREE.Mesh(

                innerWallGeo,

                materialInterior

            );

            innerWall.position.y = 0;

            innerWall.receiveShadow = true;

            group.add(innerWall);

            // Fundo interno

            const bottomGeo = new THREE.CircleGeometry(

                0.865, 96

            );

            const bottom = new THREE.Mesh(

                bottomGeo,

                materialInterior

            );

            bottom.rotation.x = -Math.PI / 2;

            bottom.position.y = -0.965;

            bottom.receiveShadow = true;

            group.add(bottom);

            // Borda superior

            const rimGeo = new THREE.TorusGeometry(

                0.95, 0.04, 16, 64

            );

            const rim = new THREE.Mesh(

                rimGeo,

                materialBase

            );

            rim.rotation.x = Math.PI / 2;

            rim.position.y = 1.0;

            rim.castShadow = true;

            group.add(rim);

            // Área da arte e arte aplicada

            if (artMaterial) {

                const artCoverage = 1.8;

                const arcLength = Math.PI * artCoverage;

                const artGeometry = new THREE.CylinderGeometry(

                    1.002,

                    0.902,

                    2.0,

                    64,

                    64,

                    true,

                    0,

                    arcLength

                );

                const artAreaMesh = new THREE.Mesh(

                    artGeometry,

                    materialArtArea

                );

                artAreaMesh.rotation.y =

                    (arcLength / 2) - 0.9;

                group.add(artAreaMesh);

                const artBody = new THREE.Mesh(

                    artGeometry,

                    artMaterial

                );

                artBody.rotation.y =

                    (arcLength / 2) - 0.9;

                artBody.scale.set(1.001, 1.001, 1.001);

                group.add(artBody);

            }

            group.add(createHandle());

            break;

        }

        case 't-shirt': {

            geometry = new THREE.PlaneGeometry(2.4, 2.8);

            mesh = new THREE.Mesh(geometry, materialOther);

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            group.add(mesh);

            if (artMaterial) {

                const artPlane = new THREE.Mesh(

                    geometry,

                    artMaterial

                );

                artPlane.position.z = 0.01;

                group.add(artPlane);

            }

            break;

        }

        case 'tile': {

            geometry = new THREE.BoxGeometry(2.0, 2.0, 0.2);

            mesh = new THREE.Mesh(geometry, materialOther);

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            group.add(mesh);

            if (artMaterial) {

                const artMaterials = new Array(6).fill(

                    artMaterial

                );

                const artBox = new THREE.Mesh(

                    geometry,

                    artMaterials

                );

                artBox.scale.set(1.002, 1.002, 1.002);

                group.add(artBox);

            }

            break;

        }

    }

    currentProduct = group;

    scene.add(group);

    updateMagicMugEffect();

}

/* ============ EFEITO DE CANECA MÁGICA ============ */

function updateMagicMugEffect() {

    if (!state.magicMugMode) return;

    const progress = THREE.MathUtils.clamp(

        state.magicRevealProgress,

        0,

        1

    );

    const smoothProgress =

        progress * progress * (3 - 2 * progress);

    // Clareia o corpo preto gradualmente

    if (state.magicBodyMaterial) {

        const coldColor = new THREE.Color('#171717');

        const targetColor = new THREE.Color(state.colors.other);

        state.magicBodyMaterial.color.copy(

            coldColor.clone().lerp(

                targetColor,

                smoothProgress

            )

        );

    }

    // Clareia a área da arte gradualmente

    if (state.magicArtAreaMaterial) {

        const coldColor = new THREE.Color('#171717');

        const targetColor = new THREE.Color(state.colors.artArea);

        state.magicArtAreaMaterial.color.copy(

            coldColor.clone().lerp(

                targetColor,

                smoothProgress

            )

        );

    }

    // Atualiza a máscara vertical sem recompilar o shader.

    if (state.magicArtMaterial) {

        atualizarShaderRevelacao(

            state.magicArtMaterial,

            smoothProgress

        );

    }

    const slider = document.getElementById('magicProgress');

    const value = document.getElementById('magicProgressValue');

    if (slider && document.activeElement !== slider) {

        slider.value = String(Math.round(progress * 100));

    }

    if (value) {

        value.textContent = `${Math.round(progress * 100)}%`;

    }

    if (state.magicAnimating) {

        state.magicRevealProgress += state.magicAnimationSpeed;

        if (state.magicRevealProgress >= 1) {

            state.magicRevealProgress = 1;

            state.magicAnimating = false;

        }

    }

}

function setMagicMugMode(enabled) {

    state.magicMugMode = enabled;

    state.magicAnimating = false;

    state.magicRevealProgress = enabled ? 0 : 1;

    if (state.product === 'mug') {

        buildProduct('mug');

    }

    const ids = [

        'magicPlay',

        'magicPause',

        'magicReset',

        'magicProgress'

    ];

    ids.forEach(id => {

        const element = document.getElementById(id);

        if (element) element.disabled = !enabled;

    });

    updateMagicMugEffect();

}

function playMagicReveal() {
    if (state.product !== 'mug') {
        state.product = 'mug';
        const select = document.getElementById('productSelect');
        if (select) select.value = 'mug';
    }

    if (!state.magicMugMode || state.magicRevealProgress >= 1) {
        state.magicMugMode = true;
        state.magicRevealProgress = 0;

        const toggle = document.getElementById('magicEnabled');
        if (toggle) toggle.checked = true;

        ['magicPlay', 'magicPause', 'magicReset', 'magicProgress'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.disabled = false;
        });
    }

    // Recria a caneca para garantir que o shader de revelação esteja aplicado.
    buildProduct('mug');
    state.magicAnimating = true;
}

function pauseMagicReveal() {

    state.magicAnimating = false;

}

function resetMagicReveal() {

    state.magicAnimating = false;

    state.magicRevealProgress = 0;

    if (state.product === 'mug') {

        buildProduct('mug');

    }

    updateMagicMugEffect();

}

/* ============ PAINEL DA CANECA MÁGICA ============ */

function createMagicMugControls() {
    if (document.getElementById('magicMugControls')) return;

    const panel = document.createElement('section');
    panel.id = 'magicMugControls';
    panel.style.cssText = `
        margin-top:18px;
        padding:14px;
        box-sizing:border-box;
        border:1px solid #d9e2ef;
        border-radius:12px;
        background:#fff;
        font:13px/1.45 Arial,sans-serif;
        color:#26354d;
    `;

    panel.innerHTML = `
        <h3 style="margin:0 0 12px;color:#367cff;font-size:14px">
            Configurações da caneca mágica
        </h3>

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer">
            <input id="magicEnabled" type="checkbox">
            <span>Ativar caneca mágica</span>
        </label>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            <button id="magicPlay" type="button"
                style="border:0;border-radius:8px;padding:9px 11px;background:#367cff;color:white;cursor:pointer">
                ▶ Revelar arte
            </button>
            <button id="magicPause" type="button"
                style="border:1px solid #d9e2ef;border-radius:8px;padding:9px 11px;background:white;color:#26354d;cursor:pointer">
                ❚❚ Pausar
            </button>
            <button id="magicReset" type="button"
                style="border:1px solid #d9e2ef;border-radius:8px;padding:9px 11px;background:white;color:#26354d;cursor:pointer">
                ↻ Reiniciar
            </button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <label for="magicProgress">Revelação da arte</label>
            <strong id="magicProgressValue">0%</strong>
        </div>
        <input id="magicProgress" type="range" min="0" max="100" value="0"
            style="width:100%;accent-color:#367cff;cursor:pointer">

        <p style="font-size:11px;color:#718096;margin-top:7px">
            A arte aparece gradualmente da parte inferior para a superior.
        </p>
    `;

    // Coloca as configurações na lateral, não sobre o canvas 3D.
    const destination =
        document.getElementById('panel-product') ||
        document.querySelector('.sidebar');

    if (destination) {
        destination.appendChild(panel);
    } else {
        console.warn('Não foi encontrado #panel-product nem .sidebar para as configurações.');
        return;
    }

    document.getElementById('magicEnabled')
        .addEventListener('change', event => {
            setMagicMugMode(event.target.checked);
        });

    document.getElementById('magicPlay')
        .addEventListener('click', playMagicReveal);

    document.getElementById('magicPause')
        .addEventListener('click', pauseMagicReveal);

    document.getElementById('magicReset')
        .addEventListener('click', resetMagicReveal);

    document.getElementById('magicProgress')
        .addEventListener('input', event => {
            state.magicAnimating = false;
            state.magicRevealProgress = Number(event.target.value) / 100;

            if (!state.magicMugMode) {
                state.magicMugMode = true;
                const toggle = document.getElementById('magicEnabled');
                if (toggle) toggle.checked = true;
            }

            if (state.product !== 'mug') {
                state.product = 'mug';
                const select = document.getElementById('productSelect');
                if (select) select.value = 'mug';
            }

            buildProduct('mug');

            ['magicPlay', 'magicPause', 'magicReset'].forEach(id => {
                const button = document.getElementById(id);
                if (button) button.disabled = false;
            });

            updateMagicMugEffect();
        });

    ['magicPlay', 'magicPause', 'magicReset', 'magicProgress'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.disabled = true;
    });
}

/* ============ FUNDO ============ */

function setBackgroundColor(hex) {

    if (bgTexture) {

        bgTexture.dispose();

        bgTexture = null;

    }

    scene.background = new THREE.Color(hex);

    state.bgColor = hex;

    const input = document.getElementById('bgColor');

    if (input) input.value = hex;

}

function setBackgroundImage(url) {

    const loader = new THREE.TextureLoader();

    loader.load(

        url,

        texture => {

            texture.mapping = THREE.UVMapping;

            texture.colorSpace = THREE.SRGBColorSpace;

            texture.wrapS = THREE.ClampToEdgeWrapping;

            texture.wrapT = THREE.ClampToEdgeWrapping;

            texture.repeat.set(1, 1);

            texture.offset.set(0, 0);

            if (bgTexture) bgTexture.dispose();

            bgTexture = texture;

            scene.background = texture;

        },

        undefined,

        error => {

            console.error('Erro ao carregar a imagem de fundo:', error);

        }

    );

}

/* ============ TEXTURA DA ARTE ============ */

function loadArtTexture(url) {

    const loader = new THREE.TextureLoader();

    loader.load(

        url,

        texture => {

            if (state.artTexture) {

                state.artTexture.dispose();

            }

            state.artTexture = texture;

            state.artTexture.colorSpace = THREE.SRGBColorSpace;

            state.artTexture.wrapS = THREE.ClampToEdgeWrapping;

            state.artTexture.wrapT = THREE.ClampToEdgeWrapping;

            state.artTexture.center.set(0.5, 0.5);

            state.artTexture.anisotropy =

                renderer.capabilities.getMaxAnisotropy();

            updateTextureTransform();

            buildProduct(state.product);

        },

        undefined,

        error => {

            console.error('Erro ao carregar a arte:', error);

        }

    );

}

function updateTextureTransform() {

    if (!state.artTexture) return;

    state.artTexture.repeat.set(

        1 / state.artScale,

        1 / state.artScale

    );

    state.artTexture.offset.set(0, 0);

    state.artTexture.rotation =

        THREE.MathUtils.degToRad(state.artRotation);

    state.artTexture.needsUpdate = true;

}

/* ============ EVENTOS DA INTERFACE ============ */

function setupUIEvents() {

    createMagicMugControls();

    document.getElementById('productSelect')

        .addEventListener('change', event => {

            state.product = event.target.value;

            state.magicAnimating = false;

            buildProduct(state.product);

            const panel =

                document.getElementById('magicMugControls');

            if (panel) {

                panel.style.display =

                    state.product === 'mug' ? '' : 'none';

            }

        });

    document.getElementById('artUpload')

        .addEventListener('change', event => {

            const file = event.target.files[0];

            if (!file) return;

            const url = URL.createObjectURL(file);

            loadArtTexture(url);

            event.target.value = '';

        });

    document.getElementById('removeArt')

        .addEventListener('click', () => {

            if (state.artTexture) {

                state.artTexture.dispose();

            }

            state.artTexture = null;

            buildProduct(state.product);

        });

    document.getElementById('artScale')

        .addEventListener('input', event => {

            state.artScale = Number(event.target.value) / 100;

            document.getElementById('scaleValue').textContent =

                event.target.value + '%';

            updateTextureTransform();

            if (state.artTexture) {

                buildProduct(state.product);

            }

        });

    document.getElementById('artRot')

        .addEventListener('input', event => {

            state.artRotation = Number(event.target.value);

            updateTextureTransform();

            if (state.artTexture) {

                buildProduct(state.product);

            }

        });

    document.getElementById('colorHandle')

        .addEventListener('input', event => {

            state.colors.handle = event.target.value;

            buildProduct(state.product);

        });

    document.getElementById('colorInterior')

        .addEventListener('input', event => {

            state.colors.interior = event.target.value;

            buildProduct(state.product);

        });

    document.getElementById('colorArtArea')

        .addEventListener('input', event => {

            state.colors.artArea = event.target.value;

            buildProduct(state.product);

        });

    document.getElementById('colorBase')

        .addEventListener('input', event => {

            state.colors.base = event.target.value;

            buildProduct(state.product);

        });

    document.getElementById('colorOther')

        .addEventListener('input', event => {

            state.colors.other = event.target.value;

            buildProduct(state.product);

        });

    document.getElementById('lightIntensity')

        .addEventListener('input', event => {

            const intensity = Number(event.target.value);

            document.getElementById('lightValue').textContent =

                event.target.value;

            if (mainLight) {

                mainLight.intensity = intensity * 2.5;

            }

        });

    document.getElementById('bgUpload')

        .addEventListener('change', event => {

            const file = event.target.files[0];

            if (!file) return;

            setBackgroundImage(URL.createObjectURL(file));

            event.target.value = '';

        });

    document.getElementById('clearBg')

        .addEventListener('click', () => {

            setBackgroundColor(state.bgColor);

        });

    document.getElementById('bgColor')

        .addEventListener('input', event => {

            setBackgroundColor(event.target.value);

        });

    document.getElementById('zoomIn')

        .addEventListener('click', () => {

            const direction = camera.position

                .clone()

                .sub(controls.target)

                .normalize();

            const distance =

                camera.position.distanceTo(controls.target);

            camera.position.copy(controls.target).add(

                direction.multiplyScalar(

                    Math.max(2, distance - 0.5)

                )

            );

        });

    document.getElementById('zoomOut')

        .addEventListener('click', () => {

            const direction = camera.position

                .clone()

                .sub(controls.target)

                .normalize();

            const distance =

                camera.position.distanceTo(controls.target);

            camera.position.copy(controls.target).add(

                direction.multiplyScalar(

                    Math.min(10, distance + 0.5)

                )

            );

        });

    document.querySelectorAll('.tab').forEach(tab => {

        tab.addEventListener('click', () => {

            document.querySelectorAll('.tab').forEach(item => {

                item.classList.remove('active');

            });

            tab.classList.add('active');

            ['art', 'product', 'background'].forEach(panel => {

                const element =

                    document.getElementById(`panel-${panel}`);

                if (element) {

                    element.hidden = tab.dataset.tab !== panel;

                }

            });

        });

    });

    document.getElementById('exportBtn')

        .addEventListener('click', () => {

            renderer.render(scene, camera);

            const link = document.createElement('a');

            link.href =

                renderer.domElement.toDataURL('image/png');

            link.download = `mockup-${state.product}.png`;

            link.click();

        });

    document.getElementById('resetBtn')

        .addEventListener('click', () => {

            state.product = 'mug';

            if (state.artTexture) {

                state.artTexture.dispose();

            }

            state.artTexture = null;

            state.artScale = 1.0;

            state.artRotation = 0;

            state.magicMugMode = false;

            state.magicRevealProgress = 0;

            state.magicAnimating = false;

            setBackgroundColor('#e2d4c3');

            state.colors = {

                handle: '#ffffff',

                interior: '#ffffff',

                artArea: '#ffffff',

                base: '#ffffff',

                other: '#ffffff'

            };

            document.getElementById('productSelect').value = 'mug';

            document.getElementById('colorHandle').value = '#ffffff';

            document.getElementById('colorInterior').value = '#ffffff';

            document.getElementById('colorArtArea').value = '#ffffff';

            document.getElementById('colorBase').value = '#ffffff';

            document.getElementById('colorOther').value = '#ffffff';

            document.getElementById('artScale').value = 100;

            document.getElementById('scaleValue').textContent = '100%';

            document.getElementById('artRot').value = 0;

            document.getElementById('lightIntensity').value = 1;

            document.getElementById('lightValue').textContent = '1.0';

            document.getElementById('bgUpload').value = '';

            document.getElementById('magicEnabled').checked = false;

            document.getElementById('magicProgress').value = 0;

            document.getElementById('magicProgressValue').textContent = '0%';

            [

                'magicPlay',

                'magicPause',

                'magicReset',

                'magicProgress'

            ].forEach(id => {

                document.getElementById(id).disabled = true;

            });

            document.getElementById('magicMugControls').style.opacity = '1';
            document.getElementById('magicMugControls').title = '';

            camera.position.set(0, 1.2, 4.5);

            controls.target.set(0, 0, 0);

            buildProduct(state.product);

        });

}

/* ============ REDIMENSIONAMENTO ============ */

window.addEventListener('resize', () => {

    if (!renderer || !camera) return;

    camera.aspect =

        container.clientWidth / container.clientHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(

        container.clientWidth,

        container.clientHeight

    );

});

/* ============ INICIAR A APLICAÇÃO ============ */

initThree();

/* ============ PALETA DE CORES PREDEFINIDAS ============ */

const coresPredefinidas = [

    "#FFFFFF", // Branco

    "#F3F4F6", // Cinza claro

    "#000000", // Preto

    "#808080", // Cinza

    "#FF0000", // Vermelho

    "#B91C1C", // Vermelho escuro

    "#FF8000", // Laranja

    "#FFC107", // Amarelo

    "#008000", // Verde

    "#00C853", // Verde claro

    "#00BCD4", // Ciano

    "#0000FF", // Azul

    "#1E40AF", // Azul escuro

    "#800080", // Roxo

    "#E91E63", // Rosa

    "#795548", // Marrom

    "#E2D4C3"  // Bege

];

function criarPaletaCores(inputId) {

    const input = document.getElementById(inputId);

    if (!input || input.dataset.paletaCriada === "true") {

        return;

    }

    input.dataset.paletaCriada = "true";

    const paleta = document.createElement("div");

    paleta.className = "paleta-cores";

    const titulo = document.createElement("div");

    titulo.className = "paleta-titulo";

    titulo.textContent = "Cores predefinidas";

    paleta.appendChild(titulo);

    coresPredefinidas.forEach((cor) => {

        const botao = document.createElement("button");

        botao.type = "button";

        botao.className = "cor-preset";

        botao.style.backgroundColor = cor;

        botao.title = cor;

        botao.setAttribute("aria-label", "Selecionar cor " + cor);

        if (input.value.toLowerCase() === cor.toLowerCase()) {

            botao.classList.add("selecionada");

        }

        botao.addEventListener("click", () => {

            input.value = cor;

            input.dispatchEvent(new Event("input", {

                bubbles: true

            }));

            input.dispatchEvent(new Event("change", {

                bubbles: true

            }));

            paleta.querySelectorAll(".cor-preset").forEach((item) => {

                item.classList.remove("selecionada");

            });

            botao.classList.add("selecionada");

        });

        paleta.appendChild(botao);

    });

    input.insertAdjacentElement("afterend", paleta);

}

// Criar uma paleta para cada opção de cor

[

    "colorHandle",

    "colorInterior",

    "colorArtArea",

    "colorBase",

    "colorOther"

].forEach(criarPaletaCores);

setupUIEvents();
