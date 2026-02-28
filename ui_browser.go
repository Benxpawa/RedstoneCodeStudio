//go:build (windows && arm64) || linux

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
)

func openUI(url string) {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	}

	if err != nil {
		log.Printf("无法自动打开浏览器: %v", err)
		fmt.Printf("请手动打开浏览器访问: %s\n", url)
	} else {
		fmt.Printf("已在浏览器中打开: %s\n", url)
	}

	// 保持程序运行，直到用户按 Ctrl+C
	fmt.Println("按 Ctrl+C 退出程序")
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	fmt.Println("程序已退出")
}
