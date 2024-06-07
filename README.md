# SCSS Selectors Finder

SCSS Selectors Finder is a Visual Studio Code extension that allows developers to easily locate nested SCSS selectors from compiled CSS selectors. This tool optimizes your workflow by enabling you to navigate complex selector relationships effortlessly.

## Features

- Automatically finds nested SCSS selectors based on CSS selectors.
- Enhances the readability and maintainability of SCSS files.
- Simplifies the process of navigating through complex selector structures.

## Usage

1. Open the SCSS Selectors Finder view from the Activity Bar.
2. Enter the CSS selector you wish to find the corresponding SCSS for.
3. The extension will search through your SCSS files and display the results, highlighting the matched selectors.

## Example

Suppose you have the following SCSS code:

```scss
.main {
  &__title {
    &--highlighted {
      font-weight: bold;
    }
  }
}
```

If you search for `.main__title--highlighted`, the extension will locate the corresponding nested structure in your SCSS files and display it:
This helps you understand the structure of your SCSS code and quickly locate specific selectors.

## Requirements

- Visual Studio Code version 1.54.0 or higher

## Release Notes

For detailed release notes, please see the [CHANGELOG.md](CHANGELOG.md) file.

### Contributing

If you would like to contribute to the development of SCSS Selectors Finder, feel free to fork the repository and submit a pull request with your changes. We appreciate your support and collaboration!

## License

SCSS Selectors Finder is released under the [MIT License](LICENSE.txt).