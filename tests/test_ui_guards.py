# -*- coding: utf-8 -*-
"""index.html のモバイルUXガード(入力時ズーム抑止・タップ時フォーカス枠抑止)の回帰テスト。

実行方法:
    python3 -m unittest discover -s tests
"""
import re
import unittest
from pathlib import Path

INDEX_HTML = Path(__file__).resolve().parent.parent / "index.html"


class UIGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = INDEX_HTML.read_text(encoding="utf-8")

    def test_viewport_disables_focus_zoom(self):
        """メインの viewport に maximum-scale=1 があり、入力フォーカス時の自動ズームを抑止する。"""
        match = re.search(r'<meta name="viewport" content="([^"]*)">', self.html)
        self.assertIsNotNone(match, "viewport メタタグが見つからない")
        content = match.group(1)
        self.assertIn("width=device-width", content)
        self.assertIn("initial-scale=1.0", content)
        self.assertIn("maximum-scale=1.0", content)

    def test_focus_ring_suppressed_for_pointer_focus(self):
        """タップ/クリック時のフォーカス枠(Tailwind ring / UA outline)を抑止するルールがある。"""
        rule_match = re.search(
            r":focus:not\(:focus-visible\)\s*\{([^}]*)\}", self.html
        )
        self.assertIsNotNone(rule_match, ":focus:not(:focus-visible) ルールが見つからない")
        body = rule_match.group(1)
        self.assertIn("outline: none !important", body)
        self.assertIn("--tw-ring-shadow: 0 0 #0000 !important", body)
        self.assertIn("--tw-ring-offset-shadow: 0 0 #0000 !important", body)

    def test_tap_highlight_disabled(self):
        """iOS/Android のタップハイライトを無効化している。"""
        self.assertIn("-webkit-tap-highlight-color: transparent", self.html)

    def test_input_font_size_unchanged(self):
        """入力欄の見た目は変更しない方針(text-sm のまま、16px 強制拡大をしていない)。"""
        self.assertIn('id="formDate"', self.html)
        form_date = re.search(r'<input[^>]*id="formDate"[^>]*>', self.html).group(0)
        self.assertIn("text-sm", form_date)

    def test_pin_inputs_show_numeric_keypad(self):
        """PIN入力欄(type=password)はiOSで数字パッドを出すため pattern=[0-9]* と inputmode=numeric を持つ。"""
        for input_id in ("pinInput", "settingsPinInput", "newPinInput"):
            with self.subTest(input_id=input_id):
                tag_match = re.search(
                    r'<input[^>]*id="%s"[^>]*>' % input_id, self.html
                )
                self.assertIsNotNone(tag_match, f"{input_id} が見つからない")
                tag = tag_match.group(0)
                self.assertIn('inputmode="numeric"', tag)
                self.assertIn('pattern="[0-9]*"', tag)

    def test_number_inputs_show_numeric_keypad(self):
        """件数・km等の number 入力はすべて inputmode=numeric を持つ。"""
        for tag in re.findall(r'<input[^>]*type="number"[^>]*>', self.html):
            with self.subTest(tag=tag[:80]):
                self.assertIn('inputmode="numeric"', tag)

    def test_print_table_borders_preserved(self):
        """帳票(印刷)側の罫線は意図的なものとして維持されている。"""
        self.assertIn(
            "#printArea th, #printArea td { border: 1px solid #333;", self.html
        )


if __name__ == "__main__":
    unittest.main()
