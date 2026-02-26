import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import gsap from 'gsap'
import earthVertexShader from './shaders/earth/vertex.glsl'
import earthFragmentShader from './shaders/earth/fragment.glsl'
import atmosphereVertexShader from './shaders/atmosphere/vertex.glsl'
import atmosphereFragmentShader from './shaders/atmosphere/fragment.glsl'

/**
 * Loader
 */
const loaderOverlay = document.getElementById('loader')
const loaderBar = document.getElementById('loaderBar')
const loaderPercent = document.getElementById('loaderPercent')
let loadedPercent = 0
let fakeProgress = 0
let loadingDone = false

// Smooth fake progress while assets load
const fakeInterval = setInterval(() => {
    if (loadingDone) return
    const maxFake = 85
    if (fakeProgress < maxFake) {
        fakeProgress += (maxFake - fakeProgress) * 0.03
        const display = Math.max(Math.round(fakeProgress), loadedPercent)
        loaderBar.style.width = display + '%'
        loaderPercent.textContent = display + '%'
    }
}, 50)

const loadingManager = new THREE.LoadingManager()
loadingManager.onProgress = (url, loaded, total) => {
    loadedPercent = Math.round((loaded / total) * 99)
    const display = Math.max(loadedPercent, Math.round(fakeProgress))
    loaderBar.style.width = display + '%'
    loaderPercent.textContent = display + '%'
}
loadingManager.onLoad = () => {
    loadingDone = true
    clearInterval(fakeInterval)

    // Jump to 99%
    loaderBar.style.width = '99%'
    loaderPercent.textContent = '99%'

    // 1.3s delay at 99%, then 100% and reveal
    setTimeout(() => {
        loaderBar.style.width = '100%'
        loaderPercent.textContent = '100%'

        setTimeout(() => {
            loaderOverlay.classList.add('done')
        }, 400)
    }, 1300)
}

/**
 * Basic settings
 */
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
const textureLoader = new THREE.TextureLoader(loadingManager)

/**
 * Stars Background - static white circles, no animation
 */
const starCount = 5000
const starGeometry = new THREE.BufferGeometry()
const starPositions = new Float32Array(starCount * 3)
const starSizes = new Float32Array(starCount)

for (let i = 0; i < starCount; i++) {
    const i3 = i * 3
    const radius = 30 + Math.random() * 70
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    starPositions[i3]     = radius * Math.sin(phi) * Math.cos(theta)
    starPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    starPositions[i3 + 2] = radius * Math.cos(phi)

    starSizes[i] = Math.random() * 1.8 + 0.4
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1))

const starMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        attribute float aSize;
        uniform float uPixelRatio;

        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float dist = length(mvPosition.xyz);
            gl_PointSize = aSize * uPixelRatio * (80.0 / dist);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float glow = 1.0 - smoothstep(0.0, 0.5, d);
            glow = pow(glow, 1.8);
            gl_FragColor = vec4(vec3(1.0), glow * 0.9);
        }
    `,
    uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
})

const stars = new THREE.Points(starGeometry, starMaterial)
scene.add(stars)

/**
 * Earth model
 */
const earthParameters = {}
earthParameters.atmosphereDayColor = '#009dff'
earthParameters.atmosphereTwilightColor = '#0008ff'

const earthDayTexture = textureLoader.load('./earth/day.jpg')
earthDayTexture.colorSpace = THREE.SRGBColorSpace

const earthNightTexture = textureLoader.load('./earth/night.jpg')
earthNightTexture.colorSpace = THREE.SRGBColorSpace

const earthSpecularCloudsTexture = textureLoader.load('./earth/specularClouds.jpg')

const earthGeometry = new THREE.SphereGeometry(2, 64, 64)
const earthMaterial = new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
        uDayTexture: new THREE.Uniform(earthDayTexture),
        uNightTexture: new THREE.Uniform(earthNightTexture),
        uSpecularCloudsTexture: new THREE.Uniform(earthSpecularCloudsTexture),
        uSunDirection: new THREE.Uniform(new THREE.Vector3(0, 0, 1)),
        uCloudsMix: { value: 0.09334 },
        uAtmosphereDayColor: new THREE.Uniform(new THREE.Color(earthParameters.atmosphereDayColor)),
        uAtmosphereTwilightColor: new THREE.Uniform(new THREE.Color(earthParameters.atmosphereTwilightColor))
    }
})
const earth = new THREE.Mesh(earthGeometry, earthMaterial)
scene.add(earth)

// Atmosphere
const atmosphereGeometry = new THREE.SphereGeometry(2, 32, 32)
const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
        uSunDirection: new THREE.Uniform(new THREE.Vector3(0, 0, 1)),
        uAtmosphereDayColor: new THREE.Uniform(new THREE.Color(earthParameters.atmosphereDayColor)),
        uAtmosphereTwilightColor: new THREE.Uniform(new THREE.Color(earthParameters.atmosphereTwilightColor))
    },
    side: THREE.BackSide,
    transparent: true
})

const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
atmosphere.scale.set(1.04, 1.04, 1.04)
scene.add(atmosphere)

/**
 * Sun
 */
const sunSpherical = new THREE.Spherical(1, Math.PI * 0.5, 0.5)
const sunDirection = new THREE.Vector3()

const updateSun = () => {
    sunDirection.setFromSpherical(sunSpherical)
    earthMaterial.uniforms.uSunDirection.value.copy(sunDirection)
    atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDirection)
}
updateSun()

/**
 * Sizes & Responsive Earth Scale
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
}

const getEarthScale = () => {
    if (sizes.width < 480) return 0.65
    if (sizes.width < 768) return 0.8
    if (sizes.width < 1024) return 0.9
    return 1.0
}

const applyEarthScale = () => {
    const s = getEarthScale()
    earth.scale.set(s, s, s)
    atmosphere.scale.set(1.04 * s, 1.04 * s, 1.04 * s)
}
applyEarthScale()

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(sizes.pixelRatio)

    starMaterial.uniforms.uPixelRatio.value = sizes.pixelRatio
    applyEarthScale()
})

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 200)
camera.position.set(8, 2, 6)
scene.add(camera)

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)
renderer.setClearColor('#000011')

// Anisotropy
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
earthDayTexture.anisotropy = maxAnisotropy
earthNightTexture.anisotropy = maxAnisotropy
earthSpecularCloudsTexture.anisotropy = maxAnisotropy

/**
 * OrbitControls (for explore mode only)
 * Attaches to the renderer.domElement (canvas) which is z-index:1
 * In explore mode, scroll-container (z-index:10) is hidden so canvas receives events
 */
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.minDistance = 4
controls.maxDistance = 20
controls.enablePan = false
controls.enabled = false
controls.autoRotate = false
controls.rotateSpeed = 0.5
controls.zoomSpeed = 0.8

/**
 * Scroll-based Camera Animation
 *
 * Camera positions for each section (tweak as needed):
 * Section 0 (Hero):     Earth right side, camera from left
 * Section 1 (Discover): Earth left side, camera from right
 * Section 2 (Life):     Earth right again, slightly higher
 * Section 3 (Data):     Earth left, from above
 * Section 4 (Gallery):  Centered, wide view
 * Section 5 (Future):   Close centered
 */
const cameraPositions = [
    { x: 8,   y: 2,   z: 6   },  // Section 0: Hero
    { x: -7,  y: 1,   z: 7   },  // Section 1: Discover
    { x: 6,   y: 3,   z: 8   },  // Section 2: Life
    { x: -6,  y: 4,   z: 7   },  // Section 3: Data
    { x: 0,   y: -2,  z: 11  },  // Section 4: Gallery
    { x: 0,   y: -2,  z: 11   },  // Section 5: Future
]

const cameraTargets = [
    { x: -2,   y: 0,   z: 0   },  // Section 0: Hero — Earth center
    { x: 0,   y: 0,   z: 0   },  // Section 1: Discover
    { x: 0,   y: 0,   z: 0   },  // Section 2: Life
    { x: 0,   y: 0,   z: 0   },  // Section 3: Data
    { x: 0,   y: 0,   z: 0   },  // Section 4: Gallery
    { x: 0,   y: 0,   z: 0   },  // Section 5: Future
]

// Current camera position target (smoothly interpolated)
const cameraTarget = { x: 0.1, y: 0, z: 12 }
// Current lookAt target (smoothly interpolated)
const lookAtTarget = { x: 0, y: 0, z: 0 }
const currentLookAt = { x: 0, y: 0, z: 0 }
let currentSection = 0
let scrollProgress = 0
let isIntroComplete = false
let isExploreMode = false

// Intro animation
gsap.to(cameraTarget, {
    x: cameraPositions[0].x,
    y: cameraPositions[0].y,
    z: cameraPositions[0].z,
    duration: 3,
    ease: "power3.inOut",
    onComplete: () => {
        isIntroComplete = true
    }
})
gsap.to(lookAtTarget, {
    x: cameraTargets[0].x,
    y: cameraTargets[0].y,
    z: cameraTargets[0].z,
    duration: 3,
    ease: "power3.inOut"
})

/**
 * Scroll handling
 */
const scrollContainer = document.getElementById('scrollContainer')
const sections = document.querySelectorAll('.section')
const navLinks = document.querySelectorAll('.nav-link')

const onScroll = () => {
    if (!isIntroComplete || isExploreMode) return

    const scrollTop = window.scrollY
    const totalHeight = document.body.scrollHeight - window.innerHeight

    if (totalHeight <= 0) return

    // Overall scroll progress 0-1
    scrollProgress = Math.min(Math.max(scrollTop / totalHeight, 0), 1)

    // Which section are we in?
    const sectionCount = cameraPositions.length
    const rawSection = scrollProgress * (sectionCount - 1)
    const sectionIndex = Math.floor(rawSection)
    const sectionFraction = rawSection - sectionIndex

    // Clamp
    const fromIdx = Math.min(sectionIndex, sectionCount - 1)
    const toIdx = Math.min(sectionIndex + 1, sectionCount - 1)

    // Smooth easing for transition (smoothstep)
    const eased = sectionFraction * sectionFraction * (3 - 2 * sectionFraction)

    // Interpolate camera position
    cameraTarget.x = cameraPositions[fromIdx].x + (cameraPositions[toIdx].x - cameraPositions[fromIdx].x) * eased
    cameraTarget.y = cameraPositions[fromIdx].y + (cameraPositions[toIdx].y - cameraPositions[fromIdx].y) * eased
    cameraTarget.z = cameraPositions[fromIdx].z + (cameraPositions[toIdx].z - cameraPositions[fromIdx].z) * eased

    // Interpolate lookAt target
    lookAtTarget.x = cameraTargets[fromIdx].x + (cameraTargets[toIdx].x - cameraTargets[fromIdx].x) * eased
    lookAtTarget.y = cameraTargets[fromIdx].y + (cameraTargets[toIdx].y - cameraTargets[fromIdx].y) * eased
    lookAtTarget.z = cameraTargets[fromIdx].z + (cameraTargets[toIdx].z - cameraTargets[fromIdx].z) * eased

    // Update active nav link based on section proximity
    const newSection = Math.round(rawSection)
    if (newSection !== currentSection) {
        currentSection = newSection
        navLinks.forEach((link, i) => {
            link.classList.toggle('active', i === currentSection)
        })
    }
}

window.addEventListener('scroll', onScroll, { passive: true })

/**
 * Section visibility (IntersectionObserver for content cards)
 */
const contentCards = document.querySelectorAll('.content-card')

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible')
        } else {
            entry.target.classList.remove('visible')
        }
    })
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
})

contentCards.forEach(card => observer.observe(card))

/**
 * Nav link smooth scroll
 */
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault()
        const sectionId = link.getAttribute('href').substring(1)
        const target = document.getElementById(sectionId)
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' })
        }
    })
})

/**
 * 360° Explore Mode
 *
 * Key fix: when explore mode is active, the scroll-container (z-index:10)
 * gets hidden with pointer-events:none, so the canvas (z-index:1) can
 * receive mouse/touch events for OrbitControls.
 * The explore overlay (z-index:200) only has pointer-events on the HUD
 * elements (close button, info), not the full overlay area.
 */
const exploreOverlay = document.getElementById('exploreOverlay')
const exploreBtn = document.getElementById('exploreBtn')
const exploreClose = document.getElementById('exploreClose')
const ctaExplore = document.getElementById('ctaExplore')
const nav = document.getElementById('nav')

// Saved state for returning from explore mode
let savedCameraPos = { x: 0, y: 0, z: 0 }
let savedLookAt = { x: 0, y: 0, z: 0 }
let savedScrollY = 0
let exploreAnimating = false

const enterExploreMode = () => {
    if (isExploreMode || exploreAnimating) return
    exploreAnimating = true
    isExploreMode = true

    // Save current state
    savedCameraPos.x = cameraTarget.x
    savedCameraPos.y = cameraTarget.y
    savedCameraPos.z = cameraTarget.z
    savedLookAt.x = lookAtTarget.x
    savedLookAt.y = lookAtTarget.y
    savedLookAt.z = lookAtTarget.z
    savedScrollY = window.scrollY

    // Hide content with nice animation
    scrollContainer.classList.add('hidden')
    nav.classList.add('nav-hidden')

    // Show explore overlay
    exploreOverlay.classList.add('active')

    // Disable page scroll
    document.body.style.overflow = 'hidden'

    // Animate camera to explore position
    const startPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    const startLook = { x: currentLookAt.x, y: currentLookAt.y, z: currentLookAt.z }
    gsap.to(startPos, {
        x: 0,
        y: 0,
        z: 11,
        duration: 1.4,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.position.set(startPos.x, startPos.y, startPos.z)
            camera.lookAt(startLook.x, startLook.y, startLook.z)
        },
        onComplete: () => {
            // Now enable controls after animation is done
            controls.target.set(0, 0, 0)
            controls.enabled = true
            controls.update()
            cameraTarget.x = 0
            cameraTarget.y = 0
            cameraTarget.z = 14
            lookAtTarget.x = 0
            lookAtTarget.y = 0
            lookAtTarget.z = 0
            exploreAnimating = false
        }
    })
    gsap.to(startLook, {
        x: 0, y: 0, z: 0,
        duration: 1.4,
        ease: "power2.inOut"
    })
}

const exitExploreMode = () => {
    if (!isExploreMode || exploreAnimating) return
    exploreAnimating = true

    // Disable controls immediately
    controls.enabled = false

    // Hide explore overlay
    exploreOverlay.classList.remove('active')

    // Get current camera position after user has rotated
    const currentCamPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    const currentLook = { x: 0, y: 0, z: 0 } // OrbitControls target is (0,0,0)

    // Animate camera back to saved scroll position
    gsap.to(currentCamPos, {
        x: savedCameraPos.x,
        y: savedCameraPos.y,
        z: savedCameraPos.z,
        duration: 1.4,
        ease: "power2.inOut",
        onUpdate: () => {
            camera.position.set(currentCamPos.x, currentCamPos.y, currentCamPos.z)
            camera.lookAt(currentLook.x, currentLook.y, currentLook.z)
        },
        onComplete: () => {
            isExploreMode = false
            exploreAnimating = false

            // Update camera target to match
            cameraTarget.x = savedCameraPos.x
            cameraTarget.y = savedCameraPos.y
            cameraTarget.z = savedCameraPos.z

            // Restore lookAt target
            lookAtTarget.x = savedLookAt.x
            lookAtTarget.y = savedLookAt.y
            lookAtTarget.z = savedLookAt.z
            currentLookAt.x = savedLookAt.x
            currentLookAt.y = savedLookAt.y
            currentLookAt.z = savedLookAt.z

            // Re-enable page scroll
            document.body.style.overflow = ''

            // Show content
            scrollContainer.classList.remove('hidden')
            nav.classList.remove('nav-hidden')

            // Restore scroll position
            window.scrollTo(0, savedScrollY)

            // Re-trigger scroll handler to sync
            onScroll()
        }
    })
    gsap.to(currentLook, {
        x: savedLookAt.x, y: savedLookAt.y, z: savedLookAt.z,
        duration: 1.4,
        ease: "power2.inOut"
    })
}

// Event listeners for explore mode
exploreBtn.addEventListener('click', enterExploreMode)
ctaExplore.addEventListener('click', enterExploreMode)
exploreClose.addEventListener('click', exitExploreMode)

// ESC key to exit explore mode
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isExploreMode) {
        exitExploreMode()
    }
})

/**
 * Animation loop
 */
const clock = new THREE.Clock()
const lerpFactor = 0.012

const tick = () => {
    const elapsedTime = clock.getElapsedTime()

    // Earth rotation
    earth.rotation.y = elapsedTime * 0.01

    if (isExploreMode && controls.enabled) {
        // In explore mode, OrbitControls handles the camera
        controls.update()
    } else if (!isExploreMode && !exploreAnimating) {
        // Smooth camera lerp to target position
        camera.position.x += (cameraTarget.x - camera.position.x) * lerpFactor
        camera.position.y += (cameraTarget.y - camera.position.y) * lerpFactor
        camera.position.z += (cameraTarget.z - camera.position.z) * lerpFactor

        // Smooth lookAt lerp to target
        currentLookAt.x += (lookAtTarget.x - currentLookAt.x) * lerpFactor
        currentLookAt.y += (lookAtTarget.y - currentLookAt.y) * lerpFactor
        currentLookAt.z += (lookAtTarget.z - currentLookAt.z) * lerpFactor

        camera.lookAt(currentLookAt.x, currentLookAt.y, currentLookAt.z)
    }

    // Render
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()

/**
 * Music toggle
 */
const audio = document.getElementById('backgroundMusic')
const musicButton = document.getElementById('musicButton')
let isPlaying = false

// Start music on first click anywhere
const startOnFirstClick = () => {
    if (!isPlaying) {
        audio.play()
        musicButton.classList.add('playing')
        isPlaying = true
    }
    window.removeEventListener('click', startOnFirstClick)
}
window.addEventListener('click', startOnFirstClick)

musicButton.addEventListener('click', () => {
    if (!isPlaying) {
        audio.play()
        musicButton.classList.add('playing')
        isPlaying = true
    } else {
        audio.pause()
        musicButton.classList.remove('playing')
        isPlaying = false
    }
})
