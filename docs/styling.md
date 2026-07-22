# Styling

The presentation runs in a simple HTML page, so style customisation is really simple. Take a look at any running instance in the DevTools. For instance, to hide the frame counter, add a style tag to the `<head>`:

```html
<style>
    #hud-counter {display:none}
</style>
```

Or adjust the green template ([extra/green.css](https://cz-nic.github.io/slidershow/extra/green.css)) that is used in the tutorial:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/CZ-NIC/slidershow@latest/extra/green.css" />
```
