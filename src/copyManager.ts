import { Notice } from 'obsidian';

export class CopyManager {
    private static cleanupHtml(element: HTMLElement): string {
        // 创建克隆以避免修改原始元素
        const clone = element.cloneNode(true) as HTMLElement;

        // 移除所有的 data-* 属性
        clone.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('data-')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        // 移除所有的 class 属性
        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('class');
        });

        // 移除所有的 id 属性
        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('id');
        });

        // 使用 XMLSerializer 安全地转换为字符串
        const serializer = new XMLSerializer();
        return serializer.serializeToString(clone);
    }

    private static async blobToDataUrl(blob: Blob): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    private static async svgToPngDataUrl(blob: Blob): Promise<string> {
        // 解析 SVG 获取合适的画布大小
        const svgText = await blob.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = doc.documentElement;

        let width = parseFloat(svg.getAttribute('width') || '');
        let height = parseFloat(svg.getAttribute('height') || '');

        // 如果没有宽高，尝试从 viewBox 中获取
        if ((!width || !height) && svg.getAttribute('viewBox')) {
            const viewBox = svg.getAttribute('viewBox')!.split(/\s+/);
            if (viewBox.length === 4) {
                width = parseFloat(viewBox[2]);
                height = parseFloat(viewBox[3]);
            }
        }

        // 兜底尺寸，避免 0 尺寸导致渲染失败
        if (!width || !height) {
            width = 1200;
            height = 800;
        }

        const serializedSvg = new XMLSerializer().serializeToString(svg);
        const url = URL.createObjectURL(new Blob([serializedSvg], { type: 'image/svg+xml' }));

        return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to create canvas context'));
                    return;
                }
                ctx.drawImage(image, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/png');
                URL.revokeObjectURL(url);
                resolve(dataUrl);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to render SVG to canvas'));
            };
            image.src = url;
        });
    }

    private static async processImages(container: HTMLElement): Promise<void> {
        const images = container.querySelectorAll('img');
        const imageArray = Array.from(images);
        
        for (const img of imageArray) {
            try {
                const response = await fetch(img.src);
                const blob = await response.blob();

                if (blob.type === 'image/svg+xml' || img.src.startsWith('data:image/svg+xml')) {
                    // 将 SVG（例如 Excalidraw 导出的）转换成 PNG，避免公众号不支持 SVG
                    const pngDataUrl = await this.svgToPngDataUrl(blob);
                    img.src = pngDataUrl;
                } else {
                    img.src = await this.blobToDataUrl(blob);
                }
            } catch (error) {
                console.error('图片转换失败:', error);
            }
        }
    }

    public static async copyToClipboard(element: HTMLElement): Promise<void> {
        try {
            const clone = element.cloneNode(true) as HTMLElement;
            await this.processImages(clone);

            const contentSection = clone.querySelector('.mp-content-section');
            if (!contentSection) {
                throw new Error('找不到内容区域');
            }
            // 使用新的 cleanupHtml 方法
            const cleanHtml = this.cleanupHtml(contentSection as HTMLElement);

            const clipData = new ClipboardItem({
                'text/html': new Blob([cleanHtml], { type: 'text/html' }),
                'text/plain': new Blob([clone.textContent || ''], { type: 'text/plain' })
            });

            await navigator.clipboard.write([clipData]);
            new Notice('已复制到剪贴板');
        } catch (error) {
            new Notice('复制失败');
        }
    }
}
