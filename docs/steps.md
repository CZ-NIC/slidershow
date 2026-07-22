# Steps

Steps let a frame reveal its content gradually as you advance through the presentation.

## `sli-step`
This element is not initially displayed but gradually appears as the user progresses through the presentation. If the value is not set, it receives the next available unfilled number. If two elements share the same number, they appear (or disappear) simultaneously. The numbers do not need to be assigned successively; you can skip values.

The property is not inherited – it concerns this particular element only. It gains the `.step-shown` or `.step-hidden` class.

A basic example:

```html
<article sli-duration=1>
    <p>Lorem ipsum</p>
    <img sli-step src="..."> <!-- displayed at step 1 -->
    <p>dolor sit amet</p>
    <img sli-step src="..."> <!-- displayed at step 2 -->
    <p sli-step>consectetur adipiscing</p>  <!-- displayed at step 3 -->
</article>
```

Steps work in a very intuitive way.

```html
<article sli-step-li>
    <h1>Seen from the beginning</h1>
    <ul>
        <li>step 2</li>
        <li>step 3</li>
        <li sli-step="1">step 1</li>
        <li>step 6</li>
        <li sli-step="4">step 4</li>
        <li>step 7</li>
    </ul>
    <p sli-step>step 8</p>
    <p sli-step="100">step last</p> <!-- you can skip numbers -->
    <p sli-step="1">step 1 (too)</p>
    <p sli-step="5">step 5</p>
    <p sli-step>step 9</p>
    <p sli-step="5">step 5 (too)</p>
    <p>seen from the beginning</p>
</article>
```

### Step styling
By default, the animation is fade in/out. It was made easy to change. Example via pure CSS:

```html
<style>
    [sli-step] {
        /* all steps appear with a blue flash */
        animation-name: blue-flash;
    }

    @keyframes blue-flash {
        from {
            background-color: blue;
        }

        to {
            background-color: unset;
        }
    }
</style>
```

## `sli-step-class`
Any contained elements with [`[sli-step]`](#sli-step) will have this class set. Ignored when [`[sli-step-shown]`](#sli-step-shown) is set. Example using [Animate.css](https://animate.style/):

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
<article sli-step-li>
    <ul sli-step-class="animate__animated animate__backInDown">
        <li>I will fall from the top</li>
        <li>Me too</li>
    </ul>
</article>
```

## `sli-step-shown`
Any contained elements with [`[sli-step]`](#sli-step) will not be hidden automatically. Instead of being shown, they receive the class given by the attribute. Suppresses [`[sli-step-class]`](#sli-step-class).

```html
<style>
    .my-class {font-weight: bold;}
</style>
<article sli-step-li>
    <ul>
        <li>Will be shown.</li>
        <li sli-step-shown="my-class">Still visible. Becomes bold at step 2.</li>
    </ul>
</article>
```

## `sli-step-li`
Every contained `<li>` element is taken as having the `sli-step` attribute (see also [`sli-step`](#sli-step)). They are not initially displayed but appear gradually as the user progresses through the presentation.

```html
<article sli-duration=1>
    <ul sli-step-li>
        <li>Lorem</li> <!-- displayed at step 1 -->
        <li>ipsum</li> <!-- displayed at step 2 -->
        <li>dolor</li> <!-- displayed at step 3 -->
        <li>sit</li>   <!-- displayed at step 4 -->
    </ul>
    <ul>
        <li>Always visible</li>
    </ul>
</article>
```

## `sli-step-duration`
How many seconds a frame step will last. By default, it takes [`sli-duration`](structure.md#sli-duration).

## `sli-step-transition-duration`
How many seconds it will take to change to an image zoom step. By default, it takes [`sli-transition-duration`](structure.md#sli-transition-duration).
