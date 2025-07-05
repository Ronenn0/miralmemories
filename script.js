// Global variables
let activeImage = null;
let currentPage = 0;
let imageFiles = [];
let imageStates = [];
let totalPages = 1;
const imagesPerPage = 9;
let originalFiles = []; // Store original files before duplication
let manualCounts = {}; // Store manual people counts

// DOM elements
const canvas = document.getElementById('canvas');
const fileInput = document.getElementById('fileInput');
const zoomSlider = document.getElementById('zoomSlider');
const previewAllButton = document.getElementById('previewAllButton');
const prevPageButton = document.getElementById('prevPage');
const nextPageButton = document.getElementById('nextPage');
const pageIndicator = document.getElementById('pageIndicator');
const pageIndicatorTop = document.querySelector('.page-indicator');
const previewContainer = document.getElementById('previewContainer');
const processingStatus = document.getElementById('processingStatus');
const peopleDetectionStatus = document.getElementById('peopleDetectionStatus');
const debugInfo = document.getElementById('debugInfo');
const manualOverride = document.getElementById('manualOverride');
const imageCountList = document.getElementById('imageCountList');
const applyManualCounts = document.getElementById('applyManualCounts');

//settings
const settings_button = document.getElementById('settings_button');
const settings = document.querySelector('.settings');
settings.style.display = 'none';

// Text settings elements
const instagramHandleInput = document.getElementById('instagramHandle');
const phoneNumberInput = document.getElementById('phoneNumber');
const text1Input = document.getElementById('text1');
const text2Input = document.getElementById('text2');
const backgroundInput = document.getElementById('textsBackgroundColor');
const alphaSliderInput = document.getElementById('alphaSlider');

function saveText(text, itemName) {
    localStorage.setItem(itemName, text);
}
text1Input.addEventListener('input', () => {
    saveText(text1Input.value, 'text1');
});
text2Input.addEventListener('input', () => {
    saveText(text2Input.value, 'text2');
});
backgroundInput.addEventListener('input', () => {
    saveText(backgroundInput.value, 'textsBackgroundColor');
    console.log(1);
});
alphaSliderInput.addEventListener('input', () => {
    saveText(alphaSliderInput.value, 'alphaSliderInput');
    console.log(2);
});

function displaySavedTextsAndBgcOnInput() {
    text1Input.value = localStorage.getItem('text1') != null ? localStorage.getItem('text1') : '';
    text2Input.value = localStorage.getItem('text2') != null ? localStorage.getItem('text2') : '';
    backgroundInput.value = localStorage.getItem('textsBackgroundColor') != null ? localStorage.getItem('textsBackgroundColor') : '#000000';
    alphaSliderInput.value = localStorage.getItem('alphaSliderInput') != null ? localStorage.getItem('alphaSliderInput') : '0.3';
}

function getBackgroundFromInput() {
    const hex = backgroundInput.value;        // e.g. "#000000"
    const alpha = alphaSliderInput.value;     // e.g. "0.3"

    // Convert hex to r, g, b
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Improved people detection using multiple methods


// Create manual override interface
function createManualOverride(files) {
    imageCountList.innerHTML = '';
    manualCounts = {};

    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'image-count-item';

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);

        const label = document.createElement('span');
        label.textContent = `${file.name} - People count:`;
        label.style.flex = '1';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        const max = 100;
        input.max = max + '';
        input.value = '1'; // Default to 1 person
        input.dataset.fileIndex = index;

        manualCounts[index] = 1;

        input.addEventListener('change', (e) => {
            manualCounts[index] = Math.max(1, Math.min(max, parseInt(e.target.value) || 1));
        });

        item.appendChild(img);
        item.appendChild(label);
        item.appendChild(input);
        imageCountList.appendChild(item);
    });

    manualOverride.style.display = 'block';
}

// Apply manual counts
applyManualCounts.addEventListener('click', () => {
    const processedFiles = [];
    let totalPeople = 0;
    let detectionResults = [];

    originalFiles.forEach((file, index) => {
        const count = manualCounts[index] || 1;
        totalPeople += count;
        detectionResults.push(`${file.name}: ${count} people`);

        for (let i = 0; i < count; i++) {
            processedFiles.push(file);
        }
    });

    // Update the processed files
    imageFiles = processedFiles;
    totalPages = Math.ceil(imageFiles.length / imagesPerPage);

    // Initialize image states array
    imageStates = new Array(imageFiles.length).fill().map(() => ({
        left: '0',
        top: '0'
    }));

    peopleDetectionStatus.textContent = `Manual override: ${originalFiles.length} images → ${processedFiles.length} total images (${totalPeople} people)`;
    debugInfo.textContent = detectionResults.join(' | ');

    // Reset to first page and update
    currentPage = 0;
    updatePageNavigation();
    loadImagesForCurrentPage();

    // Hide manual override
    manualOverride.style.display = 'none';
});

// Process uploaded files with conservative detection
async function processFilesWithPeopleDetection(files) {
    processingStatus.style.display = 'block';
    processingStatus.textContent = 'Loading images...';

    // Store original files
    originalFiles = Array.from(files);

    // Default to 1 person per image
    const processedFiles = Array.from(files); // Just use each image once by default
    let detectionResults = [];

    files.forEach((file, index) => {
        detectionResults.push(`${file.name}: 1 person (default)`);
    });

    processingStatus.style.display = 'none';
    peopleDetectionStatus.textContent = `Loaded: ${files.length} images → ${processedFiles.length} total images (${files.length} people - 1 per image default)`;
    debugInfo.textContent = detectionResults.join(' | ');

    // Show manual override option
    createManualOverride(files);

    return processedFiles;
}

// Initialize the canvas with 9 empty containers
function initializeCanvas() {
    canvas.innerHTML = '';
    for (let i = 0; i < imagesPerPage; i++) {
        const container = document.createElement('div');
        container.className = 'image-container empty';
        container.dataset.index = i;

        const img = document.createElement('img');
        img.draggable = false;
        container.appendChild(img);
        canvas.appendChild(container);
    }

    // Add event listeners to the containers
    setupContainerListeners();
}

// Set up initial image dimensions and position
function setupInitialImagePosition(img) {
    const containerSize = 130;
    const aspectRatio = img.naturalWidth / img.naturalHeight;

    // Calculate dimensions to maintain aspect ratio
    let imgWidth, imgHeight;

    if (aspectRatio > 1) {
        // Landscape image
        imgHeight = containerSize;
        imgWidth = imgHeight * aspectRatio;
    } else {
        // Portrait or square image
        imgWidth = containerSize;
        imgHeight = imgWidth / aspectRatio;
    }

    // Set dimensions
    img.style.width = `${imgWidth}px`;
    img.style.height = `${imgHeight}px`;

    // Center the image in the container
    img.style.left = `${(containerSize - imgWidth) / 2}px`;
    img.style.top = `${(containerSize - imgHeight) / 2}px`;
}

// Set up event listeners for the image containers
function setupContainerListeners() {
    const containers = document.querySelectorAll('.image-container');

    containers.forEach((container) => {
        const img = container.querySelector('img');

        img.addEventListener('mousedown', (event) => {
            handleDragStart(event, img);
        });

        img.addEventListener('touchstart', (event) => {
            handleDragStart(event.touches[0], img);
            if (event.touches.length === 2) {
                // Get the initial distance between two touch points
                startDistance = getDistance(event.touches[0], event.touches[1]);
                initialWidth = img.offsetWidth;
                initialHeight = img.offsetHeight;
            }
        });

        img.addEventListener('touchmove', (event) => {
            if (event.touches.length === 2) {
                // Calculate the new distance between the two touch points
                const currentDistance = getDistance(event.touches[0], event.touches[1]);

                // Calculate the scale factor
                const scale = currentDistance / startDistance;

                // Apply the scaling to the image
                const newWidth = initialWidth * scale;
                const newHeight = initialHeight * scale;
                img.style.width = `${newWidth}px`;
                img.style.height = `${newHeight}px`;

                event.preventDefault(); // Prevent default scrolling
            }
        });

        img.addEventListener('click', () => {
            if (!img.src) return;

            activeImage = img;
            // Update zoom slider to match current image scale
            const aspectRatio = img.naturalWidth / img.naturalHeight;
            const baseSize = aspectRatio > 1 ? 130 / aspectRatio : 130;
            const currentSize = parseFloat(img.style.width);
            const zoomValue = (currentSize / baseSize) * 100;
            zoomSlider.value = Math.min(Math.max(zoomValue, 50), 300);
        });
    });
}

// Handle drag start for images
function handleDragStart(event, img) {
    if (!img.src) return;

    const startX = event.clientX - parseFloat(img.style.left || 0);
    const startY = event.clientY - parseFloat(img.style.top || 0);

    const onMouseMove = (moveEvent) => {
        const x = moveEvent.clientX || moveEvent.touches?.[0]?.clientX;
        const y = moveEvent.clientY || moveEvent.touches?.[0]?.clientY;
        img.style.left = `${x - startX}px`;
        img.style.top = `${y - startY}px`;
    };

    const endEvent = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', endEvent);
        document.removeEventListener('touchmove', onMouseMove);
        document.removeEventListener('touchend', endEvent);

        // Save the current state of the image
        saveImageState(img);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', endEvent);
    document.addEventListener('touchmove', onMouseMove);
    document.addEventListener('touchend', endEvent);
}

// Helper function to calculate the distance between two touch points
function getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Handle zoom slider input
zoomSlider.addEventListener('input', () => {
    if (activeImage && activeImage.src) {
        const zoomValue = zoomSlider.value;
        const scale = zoomValue / 100;

        // Get the original aspect ratio
        const aspectRatio = activeImage.naturalWidth / activeImage.naturalHeight;

        // Calculate base size (what would be 100% zoom)
        let baseWidth, baseHeight;
        if (aspectRatio > 1) {
            // Landscape
            baseHeight = 130;
            baseWidth = baseHeight * aspectRatio;
        } else {
            // Portrait or square
            baseWidth = 130;
            baseHeight = baseWidth / aspectRatio;
        }

        // Apply zoom while maintaining aspect ratio
        activeImage.style.width = `${baseWidth * scale}px`;
        activeImage.style.height = `${baseHeight * scale}px`;

        // Save the current state of the image
        saveImageState(activeImage);
    }
});

// Handle file input change with people detection
fileInput.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Clear previous status
    peopleDetectionStatus.textContent = '';
    debugInfo.textContent = '';
    manualOverride.style.display = 'none';

    // Process files with people detection
    const processedFiles = await processFilesWithPeopleDetection(files);

    // Store the processed image files
    imageFiles = processedFiles;

    // Calculate the total number of pages
    totalPages = Math.ceil(imageFiles.length / imagesPerPage);

    // Initialize image states array
    imageStates = new Array(imageFiles.length).fill().map(() => ({
        left: '0',
        top: '0'
    }));

    console.log('Total images after people detection:', imageFiles.length);

    // Reset to the first page
    currentPage = 0;

    // Update the page navigation
    updatePageNavigation();

    // Load the images for the current page
    loadImagesForCurrentPage();
});

// Load images for the current page
function loadImagesForCurrentPage() {
    const containers = document.querySelectorAll('.image-container');
    const startIndex = currentPage * imagesPerPage;

    // Reset all containers to empty
    containers.forEach(container => {
        container.classList.add('empty');
        const img = container.querySelector('img');
        img.src = '';
    });

    // Load images for the current page
    for (let i = 0; i < imagesPerPage; i++) {
        const fileIndex = startIndex + i;
        if (fileIndex < imageFiles.length) {
            const container = containers[i];
            container.classList.remove('empty');

            const img = container.querySelector('img');
            const file = imageFiles[fileIndex];

            // Create a temporary URL for the image
            const imageUrl = URL.createObjectURL(file);
            img.onload = () => {
                // Revoke URL after the image is loaded
                URL.revokeObjectURL(imageUrl);

                // Apply saved state if available
                const state = imageStates[fileIndex];
                if (state && state.width && state.height) {
                    img.style.left = state.left;
                    img.style.top = state.top;
                    img.style.width = state.width;
                    img.style.height = state.height;
                } else {
                    // Set up initial position and dimensions
                    setupInitialImagePosition(img);
                    // Save the initial state
                    saveImageState(img);
                }
            };

            img.onerror = () => {
                console.error(`Failed to load image: ${file.name}`);
            };

            // Assign the URL to the image source
            img.src = imageUrl;
        }
    }

    // Update the page indicator
    pageIndicator.textContent = `Page ${currentPage + 1}`;
    pageIndicatorTop.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}

// Save the current state of an image
function saveImageState(img) {
    const container = img.parentElement;
    const containerIndex = parseInt(container.dataset.index);
    const fileIndex = currentPage * imagesPerPage + containerIndex;

    if (fileIndex < imageFiles.length) {
        imageStates[fileIndex] = {
            left: img.style.left,
            top: img.style.top,
            width: img.style.width,
            height: img.style.height
        };
    }
}

// Update page navigation buttons
function updatePageNavigation() {
    prevPageButton.disabled = currentPage === 0;
    nextPageButton.disabled = currentPage >= totalPages - 1;

    // Enable/disable preview button based on whether there are images
    const hasImages = imageFiles.length > 0;
    previewAllButton.disabled = !hasImages;
}

// Handle previous page button click
prevPageButton.addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        loadImagesForCurrentPage();
        updatePageNavigation();
    }
});

// Handle next page button click
nextPageButton.addEventListener('click', () => {
    if (currentPage < totalPages - 1) {
        currentPage++;
        loadImagesForCurrentPage();
        updatePageNavigation();
    }
});

// Create A4 canvas for a specific page
function createA4Canvas(pageIndex) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const a4Width = 525 * 6; // A4 width in pixels (300 DPI)
    const a4Height = 742.5 * 6; // A4 height in pixels (300 DPI)
    const imageSize = 127.5 * 6; // 5.1 cm in pixels at 300 DPI
    const gap = 47.5 * 6; // 1.9 cm in pixels at 300 DPI
    const gap_y = 120 * 6;

    const totalImageSize = imageSize;

    // Convert 0.4mm to pixels at 300 DPI
    const textMargin = (0.03 / 2.54) * 300 * 6; // 0.4mm in pixels at 300 DPI * 6 (scaling factor)

    // Text settings
    const instagramHandle = instagramHandleInput.value;
    const phoneNumber = phoneNumberInput.value;
    let text1 = text1Input.value;
    let text2 = text2Input.value;

    const fontSize = Math.round(0.05 / 2.54 * 300 * 6 * 1); // Make text size proportional to margin

    canvas.width = a4Width;
    canvas.height = a4Height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // We can't actually load custom fonts in this context, but we'll use a serif font as a fallback
    ctx.font = `bold ${Math.round(imageSize * 0.06)}px serif`;

    const startIndex = pageIndex * imagesPerPage;
    const endIndex = Math.min(startIndex + imagesPerPage, imageFiles.length);

    // Create an array to store promises for image loading
    const imagePromises = [];

    for (let fileIndex = startIndex; fileIndex < endIndex; fileIndex++) {
        const containerIndex = fileIndex - startIndex;
        const row = Math.floor(containerIndex / 3); // Adjust for 3 columns
        const col = containerIndex % 3;

        const file = imageFiles[fileIndex];
        const state = imageStates[fileIndex];

        // Create a promise for loading and drawing this image
        const imagePromise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                let add_x = gap * (col + 1 / 2);
                let add_y = gap_y * (row + 1 / 2);

                const dx = col * totalImageSize + add_x;
                const dy = row * totalImageSize + add_y;

                // Calculate the source rectangle for the image
                const containerWidth = 130;
                const containerHeight = 130;

                // Get the position and scale from the saved state
                const imgLeft = parseFloat(state.left || 0);
                const imgTop = parseFloat(state.top || 0);
                const imgWidth = parseFloat(state.width || 130);
                const imgHeight = parseFloat(state.height || 130);

                // Calculate the scale factor between the original image and the displayed size
                const scaleX = img.naturalWidth / imgWidth;
                const scaleY = img.naturalHeight / imgHeight;

                // Calculate the source coordinates and dimensions
                const sx = -imgLeft * scaleX;
                const sy = -imgTop * scaleY;
                const sWidth = containerWidth * scaleX;
                const sHeight = containerHeight * scaleY;

                // Draw the image
                ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, imageSize, imageSize);

                //check if there are text
                if (text1 != '' || text2 != '') {
                    // Add text overlay
                    // Semi-transparent background
                    console.log(getBackgroundFromInput());
                    ctx.fillStyle = getBackgroundFromInput();
                    const textBackgroundHeight = imageSize * 0.25; // 25% of image height
                    ctx.fillRect(dx, dy + imageSize * 0.75, imageSize, textBackgroundHeight);

                    // Wedding text
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    ctx.font = `bold ${Math.round(imageSize * 0.06)}px serif`;
                    ctx.fillText(text1, dx + imageSize / 2, dy + imageSize * 0.82);

                    if (text2) {
                        ctx.font = `${Math.round(imageSize * 0.05)}px serif`;
                        ctx.fillText(text2, dx + imageSize / 2, dy + imageSize * 0.9);
                    }
                }

                // Set text properties for border text
                ctx.fillStyle = "#000000";
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // 1. Add text ABOVE the image (upside down)
                ctx.save();
                ctx.translate(dx + imageSize / 2, dy - textMargin);
                ctx.rotate(Math.PI); // Rotate 180 degrees (upside down)
                ctx.fillText(instagramHandle, 0, 0);
                ctx.restore();

                // 2. Add text BELOW the image (normal orientation)
                ctx.fillText(instagramHandle, dx + imageSize / 2, dy + imageSize + textMargin);

                // 3. Add text to the RIGHT of the image (facing LEFT - REVERSED)
                ctx.save();
                ctx.translate(dx + imageSize + textMargin, dy + imageSize / 2);
                ctx.rotate(-Math.PI / 2); // Rotate 90 degrees counter-clockwise (facing left)
                ctx.fillText(phoneNumber, 0, 0);
                ctx.restore();

                // 4. Add text to the LEFT of the image (facing RIGHT - REVERSED)
                ctx.save();
                ctx.translate(dx - textMargin, dy + imageSize / 2);
                ctx.rotate(Math.PI / 2); // Rotate 90 degrees clockwise (facing right)
                ctx.fillText(phoneNumber, 0, 0);
                ctx.restore();

                // Draw cutting guides
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 2;

                let offset_w = 3.5 / 2.54 * 300 / 2;
                let offset_h = 2.3 / 2.54 * 300 / 2;

                let point_x1 = dx + imageSize / 2;
                let point_y1 = dy - gap / 2;
                let point_y1_down = dy + imageSize + gap / 2;
                const g = gap / 2;
                const s = imageSize;
                const flat = 4 / 2.54 * 300 * 6; // 4cm
                const corner = 3 / 2.54 * 300 * 6; // 3cm

                // === FIXED POINTS AROUND THE IMAGE ===
                ctx.beginPath();
                ctx.moveTo(dx + g, dy - g); // Point 1
                ctx.lineTo(dx + s - g, dy - g); // Point 2 (top-right flat)
                ctx.lineTo(dx + s + g, dy + g); // Point 3 (diagonal corner)
                ctx.lineTo(dx + s + g, dy + s - g); // Point 4 (right-down flat)
                ctx.lineTo(dx + s - g, dy + s + g); // Point 5 (bottom-right)
                ctx.lineTo(dx + g, dy + s + g); // Point 6 (bottom)
                ctx.lineTo(dx - g, dy + s - g); // Point 7 (bottom-left)
                ctx.lineTo(dx - g, dy + g); // Point 8 (left)
                ctx.lineTo(dx + g, dy - g); // Back to Point 1
                ctx.closePath();
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 2;
                ctx.stroke();

                resolve();
            };

            img.onerror = () => {
                console.error(`Failed to load image: ${file.name}`);
                resolve(); // Resolve anyway to continue with other images
            };

            img.src = URL.createObjectURL(file);
        });

        imagePromises.push(imagePromise);
    }

    // Return a promise that resolves when all images are drawn
    return Promise.all(imagePromises).then(() => canvas);
}

// Preview all pages - render canvases directly in DOM
previewAllButton.addEventListener('click', async () => {
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'block';

    // Show loading message
    const loadingMsg = document.createElement('p');
    loadingMsg.textContent = 'Generating A4 canvases...';
    loadingMsg.style.textAlign = 'center';
    loadingMsg.style.fontSize = '18px';
    previewContainer.appendChild(loadingMsg);

    try {
        // Generate all canvases
        for (let i = 0; i < totalPages; i++) {
            const canvas = await createA4Canvas(i);

            // Remove loading message after first canvas
            if (i === 0) {
                previewContainer.removeChild(loadingMsg);
            }

            // Add page title
            const pageTitle = document.createElement('div');
            pageTitle.className = 'canvas-page-title';
            pageTitle.textContent = `Page ${i + 1}`;
            previewContainer.appendChild(pageTitle);

            // Add the canvas directly to the DOM
            const image = new Image();
            image.src = canvas.toDataURL("image/png");
            image.className = "outputImage"; // Keep styling consistent if needed
            previewContainer.appendChild(image);
        }

        // Add instruction text
        const instruction = document.createElement('p');
        instruction.textContent = 'Hold and press on any canvas to save it to your photos';
        instruction.style.textAlign = 'center';
        instruction.style.fontSize = '16px';
        instruction.style.fontWeight = 'bold';
        instruction.style.margin = '30px 0';
        instruction.style.color = '#007bff';
        previewContainer.appendChild(instruction);

    } catch (error) {
        console.error('Error generating canvases:', error);
        previewContainer.innerHTML = '<p style="text-align: center; color: red;">Error generating canvases. Please try again.</p>';
    }

    // Scroll to the preview
    previewContainer.scrollIntoView({ behavior: 'smooth' });
});

settings_button.addEventListener('click', () => {
    settings.style.display = settings.style.display == 'none' ? 'block' : 'none';
});

// Initialize the page
displaySavedTextsAndBgcOnInput();
initializeCanvas();
updatePageNavigation();
