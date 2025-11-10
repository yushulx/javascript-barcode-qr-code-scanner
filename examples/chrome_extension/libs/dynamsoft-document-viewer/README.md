# Dynamsoft Document Viewer

![version](https://img.shields.io/npm/v/dynamsoft-document-viewer.svg)
![downloads](https://img.shields.io/npm/dm/dynamsoft-document-viewer.svg) 
![jsdelivr](https://img.shields.io/jsdelivr/npm/hm/dynamsoft-document-viewer.svg)

## Table of Contents

- [Introduction](#introduction)
- [System Requirements](#system-requirements)
- [License Key](#license-key)
- [Adding the Dependency](#adding-the-dependency)
- [Creating HelloWorld](#creating-helloworld)
- [Documentation](#documentation)
- [Contact Us](#contact-us)
- [License Agreement](#license-agreement)
- [Changelog](#changelog)

## Introduction

[Dynamsoft Document Viewer (DDV)](https://www.dynamsoft.com/document-viewer/docs/introduction/index.html) is a browser-based JavaScript SDK designed for viewing and editing images and PDFs. It provides a wide range of functionalities, including PDF annotation, page manipulation, image quality enhancement, and document saving. To see it in action, please visit this [online demo](https://demo.dynamsoft.com/document-viewer/).

### Security

Dynamsoft Document Viewer does not rely on any external third-party JavaScript library. All processing, such as rendering and editing, is securely performed within the browser. This architecture eliminates the need for a server-side backend, ensuring security compliance and scalability.

### Browser and Platform Compatibility

Dynamsoft Document Viewer is designed to work seamlessly across different browsers and platforms. It is compatible with major browsers like Chrome, Firefox, Safari, and Edge, ensuring a consistent user experience. Additionally, it supports various operating systems, including Windows, macOS, Linux, iOS, and Android, allowing users to access documents from any device.

### Supported File Types

Users can open, edit, and save PDFs, as well as images in various formats, such as JPEG, PNG, and TIFF.

### Annotation Types

Dynamsoft Document Viewer supports a variety of annotation types to enhance document interaction and collaboration. Users can add, edit, and delete annotations such as:

- text
- highlight
- underline
- strikeout
- shape
- stamp
- freehand drawing

### Data Management Concepts

Dynamsoft Document Viewer organizes data using two main concepts: "document" and "page". A document can contain one or multiple pages, and each page must belong to a single document.

- Page: The smallest unit of data management, currently represented as an image. Each page has a unique pageUid.
- Document: A collection of pages, each with a unique docUid. Documents collectively make up the entire data set.
Managing data, therefore, involves managing documents and pages.

If you are using the default UI of DDV, data processing and management are handled internally.

### UI Customization

The SDK offers extensive customization options, enabling developers to tailor the UI to meet specific application needs and branding requirements.

### Designed to Support Diverse Document Workflows

Dynamsoft Document Viewer is built to support a wide range of document-centric workflows with its document viewing, editing, and scanning features. It has four built-in viewer types to suit different use cases:

* **Edit Viewer**: Enables viewing and editing of documents with annotation support.
* **Capture Viewer**: Integrates camera controls for streamlined, continuous capture workflows.
* **Perspective Viewer**: Allows document cropping with perspective transformation.
* **Browse Viewer**: Suitable for previewing multi-page documents or navigating document collections.

## System Requirements

The SDK requires the following features to work:

- `WebAssembly`, `Blob`, `URL`/`createObjectURL`, `Web Workers`

Supported Browsers:

The following table is a list of supported browsers based on the above requirements:

| Browser Name |             PC                   |   Mobile    |
| :----------: | :------------------------------: | :---------: |
|    Chrome    |             v75+                 |   v75+      |
|   Firefox    |             v69+                 |   v79+      |
|    Safari    |             v14+                 |   v15+      |
|     Edge     |             v79+                 |   v92+      |

Apart from the browsers, the operating systems may impose some limitations of their own that could restrict the use of the SDKs.

## License Key

[![](https://img.shields.io/badge/Get-30--day%20FREE%20Trial%20License-blue)](https://www.dynamsoft.com/customer/license/trialLicense/?product=ddv&utm_source=npm)

## Adding the Dependency

Please refer to [this article](https://www.dynamsoft.com/document-viewer/docs/gettingstarted/add_dependency.html).

## Creating HelloWorld

Please refer to the guide: [How to create HelloWorld](https://www.dynamsoft.com/document-viewer/docs/gettingstarted/helloworld.html)

Complete code:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>DDV - HelloWorld</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/ddv.css">
    <script src="https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/ddv.js"></script>
</head>
<style>
    html,body {
        width: 100%;
        height: 100%;
        margin:0;
        padding:0;
        overscroll-behavior-y: none;
        overflow: hidden;
    }

    #container {
        width: 100%;
        height: 100%;
    }
</style>
<body>
    <div id="container"></div>
</body>
<script type="module">
    (async () => {
        // Public trial license which is valid for 24 hours
        // You can request a 30-day trial key from https://www.dynamsoft.com/customer/license/trialLicense/?product=ddv
        Dynamsoft.DDV.Core.license = "DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9";
        Dynamsoft.DDV.Core.engineResourcePath = "https://cdn.jsdelivr.net/npm/dynamsoft-document-viewer@latest/dist/engine";
        await Dynamsoft.DDV.Core.init();
        const editViewer = new Dynamsoft.DDV.EditViewer({
            container: "container",
            uiConfig: Dynamsoft.DDV.getDefaultUiConfig("editViewer"),
        });
    })();
</script>
</html>
```

## Documentation

* [Developer's Guide](https://www.dynamsoft.com/document-viewer/docs/introduction/index.html)
* [API Reference](https://www.dynamsoft.com/document-viewer/docs/api/index.html)

## Contact Us

[Contact Dynamsoft](https://www.dynamsoft.com/company/contact/) to resolve any issue you encounter with the library.

## License Agreement

https://www.dynamsoft.com/company/license-agreement/

## Changelog

Check out the [release notes](https://www.dynamsoft.com/document-viewer/docs/releasenotes/index.html) of the Dynamsoft Document Viewer.
