# UEFIChineseFontGenerate

UEFI 中文字库生成工具，用于生成 UEFI EFI_WIDE_GLYPH 格式的字体数据。

## 功能特点

- 支持多种字体格式输入（.hex、.otf、.ttf）
- 自动转换为 UEFI EFI_WIDE_GLYPH 格式
- 16x19 点阵预览
- 支持批量字符转换

## 使用方法

1. 打开 UEFIChineseFontGenerate.html
2. 选择字体文件（支持 .hex、.otf、.ttf 格式）
3. 在输入框中输入需要转换的汉字
4. 点击"生成字库"按钮
5. 查看输出结果和点阵预览

## 输出格式

生成的数据格式符合 UEFI 规范中的 EFI_WIDE_GLYPH 结构：
- 字符编码（Unicode）
- 左半部分点阵数据（19 字节）
- 右半部分点阵数据（19 字节）
- 填充数据（3 字节）

## 致谢

本项目使用了以下开源项目：

- [opentype.js](https://opentype.js.org/) - (The MIT License (MIT) Copyright (c) 2020 Frederik De Bleser）

## 许可证

BSD 2-Clause License

Copyright (c) 2024, Yang Gang
