//go:build windows && amd64

package main

import (
	webview "github.com/webview/webview_go"
)

func openUI(url string) {
	w := webview.New(true)
	defer w.Destroy()
	w.SetTitle("RedstoneCode Studio")
	w.SetSize(1280, 800, webview.HintNone)
	w.Navigate(url)
	w.Run()
}
