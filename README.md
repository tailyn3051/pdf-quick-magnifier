# PDF Quick Magnifier

A client-side web application to create magnified detail views (callouts) on your PDF files. Upload a PDF, select an area on any page, and click an empty spot to place a magnified version, complete with an arrow pointing to the source. All processing is done directly in your browser, ensuring your files remain private.

---

## ✨ Features

- ✅ **Client-Side Processing:** Securely process files directly in your browser. No files are ever uploaded to a server.
- ✨ **High-Resolution Rendering:** PDF pages are rendered at high quality, ensuring both the page and magnified callouts are crisp and clear.
- ↔️ **Zoom & Pan:** Hold the `Alt` key to interact. Scroll to zoom and drag to pan, allowing for easy navigation and selection of precise details.
- ✨ **Reset View:** Middle-click anywhere on the page to instantly reset the zoom and pan.
- ↩️ **Undo/Redo:** Easily correct mistakes with back and forward buttons for your annotations.
- 🚫 **Cancel Selection:** Press the `Escape` key at any time during placement to cancel the current selection.
- 🖼️ **Interactive Canvas:** Select, place, and see your magnified callouts directly on the PDF pages.
- 🔎 **Adjustable Magnification:** Use a simple slider to control the zoom level of your detail views.
- 🏹 **Automatic Arrows:** An arrow is automatically drawn from the original selection to the magnified callout, ensuring clarity.
- 🌐 **Bilingual Support:** Instantly switch the UI between English (en) and Traditional Chinese (zh-TW).
- ⚡ **Live Editing:** Your annotations appear instantly on the page as you create them.
- 📥 **Multiple Download Options:**
    - Download all annotated pages in a single `.zip` archive.
    - Download the complete document as a new, annotated PDF.
- 📱 **Responsive Design:** Works seamlessly on both desktop and mobile devices.

---

## 🛠️ Technology Stack

This project is built with modern web technologies and runs entirely in the browser without a backend or complex build process.

- **Frontend:** [React](https://react.dev/) (v19) & [TypeScript](https://www.typescriptlang.org/)
- **In-Browser Transpilation:** [Babel Standalone](https://babeljs.io/docs/babel-standalone)
- **PDF Processing Libraries:**
    - [pdf.js](https://mozilla.github.io/pdf.js/): For reading and rendering PDF pages onto a canvas.
    - [pdf-lib](https://pdf-lib.js.org/): For creating the final annotated PDF document from images.
    - [JSZip](https://stuk.github.io/jszip/): For creating the `.zip` archive for bulk downloads.

---

## 🚀 How to Use

1.  **Upload PDF:** Click to upload your PDF file. The pages will be rendered in the results panel.
2.  **Navigate (Optional):**
    - Hold `Alt` and use your mouse wheel to zoom in and out.
    - Hold `Alt` and drag with your mouse to pan the view.
    - Middle-click on the page at any time to return to the default zoom and position.
3.  **Select Area:** On any page, click and drag to draw a box around the detail you want to magnify.
4.  **Place View:** A preview of the magnified view will follow your cursor. Move it to an empty area on the page and click to place it.
5.  **Cancel (Optional):** If you decide not to place the view after selecting an area, simply press the `Escape` key.
6.  **Undo/Redo (Optional):** Use the Undo and Redo buttons in the left panel to correct any mistakes.
7.  **Download:** Once you're finished, download your annotated files in your preferred format (ZIP or PDF).

---

## 💻 Local Development

**Critical Note:** This application uses modern JavaScript modules (`import`/`export`). For security reasons, web browsers do not allow these modules to be loaded from local files (`file:///...`). Therefore, you **must** use a simple local web server to run this application. Simply opening the `index.html` file by double-clicking it in your file explorer **will not work** and will result in a script or CORS error.

1.  **Clone the repository:**
    ```bash
    git clone [your-repository-url]
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd [your-project-directory]
    ```

3.  **Start a local server.**
    If you have Python 3 installed, you can use this command in your terminal:
    ```bash
    python -m http.server
    ```
    Alternatively, you can use a tool like the "Live Server" extension for Visual Studio Code.

4.  **Open your browser** and navigate to `http://localhost:8000` (or the port your server is running on).
