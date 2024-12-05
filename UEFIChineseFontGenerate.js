let fontData = null;
let fontType = null;
let parsedFont = null;

document.getElementById('fontFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const allowedExtensions = ['hex', 'otf', 'ttf'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        alert('请选择支持的字体文件类型 (.hex, .otf, .ttf)');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = function(event) {
        fontData = event.target.result;
        fontType = fileExtension;

        if (fontType === 'otf' || fontType === 'ttf') {
            try {
                parsedFont = opentype.parse(fontData);
            } catch (error) {
                console.error('解析字体文件时出错:', error);
                alert('字体文件解析失败');
            }
        }
    };

    if (fileExtension === 'hex') {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

function extractCharacterBitmap(char) {
    if (!fontData) {
        alert('请先上传字体文件');
        return null;
    }

    const charCode = char.charCodeAt(0).toString(16).toUpperCase();

    if (fontType === 'hex') {
        const lines = fontData.split('\n');
        const charLine = lines.find(line => line.startsWith(charCode + ':'));

        if (!charLine) return null;

        const hexData = charLine.split(':')[1].replace(/\s/g, '');
        const bitmap = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bitmap[i] = parseInt(hexData.substr(i*2, 2), 16);
        }
        return bitmap;
    } else if (fontType === 'otf' || fontType === 'ttf') {
        try {
            const glyph = parsedFont.charToGlyph(char);
            const bitmap = new Uint8Array(32);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 16;
            canvas.height = 16;
            ctx.clearRect(0, 0, 16, 16);

            const path = glyph.getPath(0, 14, 16);
            path.fill = 'black';

            ctx.fillStyle = 'black';
            path.draw(ctx);

            const imageData = ctx.getImageData(0, 0, 16, 16);
            const pixels = imageData.data;
            const threshold = 128;

            for (let y = 0; y < 16; y++) {
                let byte1 = 0;
                let byte2 = 0;
                const rowOffset = y * 16 * 4;

                for (let x = 0; x < 16; x++) {
                    const pixelIndex = rowOffset + x * 4;
                    const isBlack = pixels[pixelIndex + 3] > threshold;

                    if (x < 8) {
                        byte1 |= (isBlack ? 1 : 0) << (7 - x);
                    } else {
                        byte2 |= (isBlack ? 1 : 0) << (15 - x);
                    }
                }

                bitmap[y * 2] = byte1;
                bitmap[y * 2 + 1] = byte2;
            }

            return bitmap;
        } catch (error) {
            console.error('处理字符时出错:', error);
            return null;
        }
    } else {
        alert('不支持的字体文件');
    }
}

function generateGlyphs() {
    console.time('总体处理时间');
    if (!fontData) {
        alert('请先上传字体文件');
        return;
    }

    const input = document.getElementById('charInput').value;
    if (!input.trim()) {
        alert('请输入汉字');
        return;
    }

    const outputArea = document.getElementById('outputArea');
    const glyphPreview = document.getElementById('glyphPreview');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 16;
    canvas.height = 16;

    glyphPreview.innerHTML = '';
    
    // 收集所有数据
    const previewDataArray = [];
    const outputDataArray = [];

    for (let char of input) {
        console.time(`处理字符"${char}"`);
        const bitmap = extractCharacterBitmap(char, canvas, ctx);
        
        if (bitmap) {
            console.time(`转换字符"${char}"为EFI格式`);
            const binaryData = convertToEFIWideGlyph(bitmap, char);
            console.timeEnd(`转换字符"${char}"为EFI格式`);

            // 存储输出数据
            outputDataArray.push(binaryData.fullOutput);
            
            // 存储预览数据
            previewDataArray.push({
                glyphData: binaryData.glyphData,
                index: input.indexOf(char)
            });
        }
        console.timeEnd(`处理字符"${char}"`);
    }

    // 一次性输出所有字库数据
    console.time('输出字库数据');
    outputArea.value = outputDataArray.join('');
    console.timeEnd('输出字库数据');

    // 批量渲染所有预览
    console.time('渲染所有预览');
    previewDataArray.forEach(({glyphData, index}) => {
        renderGlyphPreview(glyphData, glyphPreview, index);
    });
    console.timeEnd('渲染所有预览');
    
    console.timeEnd('总体处理时间');
}

function generateGlyphsFromRange() {
    console.time('Unicode范围处理时间');
    if (!fontData) {
        alert('请先上传字体文件');
        return;
    }

    const start = parseInt(document.getElementById('unicodeRangeStart').value, 16);
    const end = parseInt(document.getElementById('unicodeRangeEnd').value, 16);

    if (isNaN(start) || isNaN(end)) {
        alert('请输入有效的Unicode范围（十六进制）');
        return;
    }

    if (start > end) {
        alert('起始值不能大于结束值');
        return;
    }

    const charCount = end - start + 1;
    const showPreview = charCount <= 20;

    const outputArea = document.getElementById('outputArea');
    const glyphPreview = document.getElementById('glyphPreview');
    glyphPreview.innerHTML = '';
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 16;
    canvas.height = 16;

    const previewDataArray = [];
    const outputDataArray = [];
    
    // 添加进度显示
    const progressText = document.createElement('div');
    document.body.appendChild(progressText);

    // 批处理大小
    const BATCH_SIZE = 100;
    let currentIndex = start;

    function processBatch() {
        console.time(`处理批次 ${currentIndex.toString(16)}`);
        const batchEnd = Math.min(currentIndex + BATCH_SIZE - 1, end);
        
        for (let code = currentIndex; code <= batchEnd; code++) {
            const char = String.fromCodePoint(code);
            const bitmap = extractCharacterBitmap(char, canvas, ctx);

            if (bitmap) {
                const binaryData = convertToEFIWideGlyph(bitmap, char);
                outputDataArray.push(binaryData.fullOutput);

                if (showPreview) {
                    previewDataArray.push({
                        glyphData: binaryData.glyphData,
                        index: code - start
                    });
                }
            }
        }
        console.timeEnd(`处理批次 ${currentIndex.toString(16)}`);

        // 更新进度（每批次只更新一次）
        const progress = Math.floor(((batchEnd - start + 1) / charCount) * 100);
        progressText.textContent = `处理进度: ${progress}% (${batchEnd - start + 1}/${charCount})`;

        currentIndex = batchEnd + 1;

        if (currentIndex <= end) {
            // 使用requestIdleCallback在浏览器空闲时处理下一批
            requestIdleCallback(() => processBatch(), { timeout: 1000 });
        } else {
            // 所有处理完成，一次性更新UI
            finishProcessing();
        }
    }

    function finishProcessing() {
        console.time('完成处理');
        
        // 一次性输出所有字库数据
        console.time('输出字库数据');
        outputArea.value = outputDataArray.join('');
        console.timeEnd('输出字库数据');

        // 渲染预览
        if (showPreview) {
            console.time('渲染所有预览');
            previewDataArray.forEach(({glyphData, index}) => {
                renderGlyphPreview(glyphData, glyphPreview, index);
            });
            console.timeEnd('渲染所有预览');
        } else {
            glyphPreview.style.display = 'block';
            glyphPreview.style.width = '100%';
            glyphPreview.innerHTML = `
                <div style="color: #666; padding: 10px; text-align: left; width: 100%; display: block;">
                    字符数量（${charCount}个）超过20个，已禁用点阵预览
                </div>
            `;
        }

        document.body.removeChild(progressText);
        console.timeEnd('完成处理');
        console.timeEnd('Unicode范围处理时间');
    }

    // 开始处理第一批
    processBatch();
}

function convertToEFIWideGlyph(bitmap, char) {
    const extendedBitmap = extendBitmap(bitmap);

    const col1 = extendedBitmap.slice(0, 19);
    const col2 = extendedBitmap.slice(19);

    let fullOutput = `{0x${char.charCodeAt(0).toString(16)}, 0x00, `;

    fullOutput += `{${col1.map(b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}}, `;
    fullOutput += `{${col2.map(b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}}, `;
    fullOutput += `{0x00,0x00,0x00}},`;
    fullOutput += `        // ${char.toString()}\n`;

    return {
        fullOutput,
        glyphData: extendedBitmap
    };
}

function extendBitmap(bitmap) {
    const extendedBitmap = new Array(38).fill(0);

    for (let i = 0; i < 16; i++) {
        const rowHigh = bitmap[i * 2];
        const rowLow = bitmap[i * 2 + 1];
        extendedBitmap[i] = rowHigh;
        extendedBitmap[i + 19] = rowLow;
    }

    return extendedBitmap;
}

function renderGlyphPreview(glyphData, container, glyphIndex, options = {}) {
    const {
        pixelSize = 10,
        maxColumns = 5,
        gapX = 5,
        gapY = 5
    } = options;

    if (glyphIndex === 0) {
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${maxColumns}, auto)`;
        container.style.gap = `${gapY}px ${gapX}px`;
    }

    const glyphContainer = document.createElement('div');
    glyphContainer.style.position = 'relative';
    glyphContainer.style.width = `${16 * pixelSize}px`;
    glyphContainer.style.height = `${19 * pixelSize}px`;

    for (let row_pixel = 0; row_pixel < 19; row_pixel++) {
        for (let col_pixel = 0; col_pixel < 16; col_pixel++) {
            const pixel = document.createElement('div');
            pixel.style.position = 'absolute';
            pixel.style.width = `${pixelSize}px`;
            pixel.style.height = `${pixelSize}px`;
            pixel.style.left = `${col_pixel * pixelSize}px`;
            pixel.style.top = `${row_pixel * pixelSize}px`;

            const byteIndex = col_pixel < 8 ? row_pixel : row_pixel + 19;
            const bitPosition = col_pixel % 8;
            const byte = glyphData[byteIndex];
            const isActive = (byte & (1 << (7 - bitPosition))) !== 0;

            pixel.classList.add('pixel');
            if (isActive) {
                pixel.classList.add('active');
            }
            
            glyphContainer.appendChild(pixel);
        }
    }

    const indexLabel = document.createElement('div');
    indexLabel.textContent = `Glyph ${glyphIndex}`;
    indexLabel.style.textAlign = 'center';
    indexLabel.style.width = `${16 * pixelSize}px`;

    const wrapper = document.createElement('div');
    wrapper.appendChild(indexLabel);
    wrapper.appendChild(glyphContainer);

    container.appendChild(wrapper);
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && document.activeElement.id === 'charInput') {
        if (!fontData) {
            alert('请先上传字体文件');
            return;
        }

        const input = document.getElementById('charInput').value;
        if (!input.trim()) {
            alert('请输入汉字');
            return;
        }

        generateGlyphs();
    }
} 