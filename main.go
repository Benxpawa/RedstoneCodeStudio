package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"golang.org/x/text/encoding/simplifiedchinese"
)

var (
	buildLock    sync.Mutex
	ProgramDir   string
	MavenCommand string
)

// TempBuildDir 在 init() 中基于 ProgramDir 动态设置
var TempBuildDir string

func init() {
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("无法获取程序路径: %v", err)
	}
	ProgramDir = filepath.Dir(exePath)
	log.Printf("程序所在目录: %s", ProgramDir)

	MavenCommand = getMavenCommand()
	log.Printf("使用 Maven 命令: %s", MavenCommand)

	TempBuildDir = filepath.Join(ProgramDir, "builds")
}

func getMavenCommand() string {
	mavenBin := filepath.Join(ProgramDir, "resources", "maven", "bin")

	var mvnExec string
	if runtime.GOOS == "windows" {
		mvnExec = filepath.Join(mavenBin, "mvn.cmd")
		if _, err := os.Stat(mvnExec); err != nil {
			mvnExec = filepath.Join(mavenBin, "mvn.bat")
		}
	} else {
		mvnExec = filepath.Join(mavenBin, "mvn")
	}

	if info, err := os.Stat(mvnExec); err == nil && !info.IsDir() {
		if runtime.GOOS != "windows" && info.Mode()&0111 == 0 {
			if err := os.Chmod(mvnExec, 0755); err != nil {
				log.Printf("警告: 无法为内置 Maven 添加执行权限: %v", err)
			}
		}
		return mvnExec
	}

	log.Println("内置 Maven 不存在，将使用系统 PATH 中的 mvn")
	return "mvn"
}

func decodeGBK(s []byte) string {
	decoder := simplifiedchinese.GBK.NewDecoder()
	out, _ := decoder.Bytes(s)
	return string(out)
}

type BuildRequest struct {
	PluginName  string `json:"pluginName"`
	PackageName string `json:"packageName"`
	MainClass   string `json:"mainClass"`
	FullMain    string `json:"fullMain"`
	Version     string `json:"version"`
	Author      string `json:"author"`
	Website     string `json:"website"`
	GroupId     string `json:"groupId"`
	ArtifactId  string `json:"artifactId"`
	JavaCode    string `json:"javaCode"`
	PluginYaml  string `json:"pluginYml"`
	ConfigYaml  string `json:"configYml"`
	PomXml      string `json:"pomXml"`
}

func main() {
	os.MkdirAll(TempBuildDir, 0755)

	port := getFreePort()
	addr := fmt.Sprintf(":%d", port)
	url := fmt.Sprintf("http://localhost:%d", port)

	http.Handle("/", http.FileServer(http.Dir(filepath.Join(ProgramDir, "resources"))))
	http.HandleFunc("/api/build", buildHandler)

	go func() {
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Fatal(err)
		}
	}()

	waitForServer(url)

	// openUI 由各平台的实现文件提供
	openUI(url)
}

func getFreePort() int {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		return 8080
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func waitForServer(url string) {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	for i := 0; i < 20; i++ {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func buildHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("收到编译请求，方法: %s, URL: %s", r.Method, r.URL.Path)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	buildLock.Lock()
	defer buildLock.Unlock()

	projectDir := filepath.Join(TempBuildDir, req.PluginName)

	if err := os.RemoveAll(projectDir); err != nil {
		log.Printf("无法清除旧构建目录 %s: %v，中止本次构建", projectDir, err)
		http.Error(w, "无法清除旧构建目录，请稍后重试", http.StatusInternalServerError)
		return
	}

	if err := os.MkdirAll(projectDir, 0755); err != nil {
		log.Printf("创建项目目录失败: %v", err)
		http.Error(w, "无法创建项目目录", http.StatusInternalServerError)
		return
	}

	packagePath := strings.ReplaceAll(req.PackageName, ".", "/")
	javaSourceDir := filepath.Join(projectDir, "src/main/java", packagePath)
	resDir := filepath.Join(projectDir, "src/main/resources")

	if err := os.MkdirAll(javaSourceDir, 0755); err != nil {
		log.Printf("创建源码目录失败: %v", err)
		http.Error(w, "无法创建源码目录", http.StatusInternalServerError)
		return
	}
	if err := os.MkdirAll(resDir, 0755); err != nil {
		log.Printf("创建资源目录失败: %v", err)
		http.Error(w, "无法创建资源目录", http.StatusInternalServerError)
		return
	}

	if req.PomXml != "" {
		writeFile(filepath.Join(projectDir, "pom.xml"), req.PomXml)
	} else {
		writeFile(filepath.Join(projectDir, "pom.xml"), getPom(req))
	}

	if req.PluginYaml != "" {
		writeFile(filepath.Join(resDir, "plugin.yml"), req.PluginYaml)
	} else {
		writeFile(filepath.Join(resDir, "plugin.yml"), getPluginYml(req))
	}

	if req.ConfigYaml != "" {
		writeFile(filepath.Join(resDir, "config.yml"), req.ConfigYaml)
	}

	javaFilePath := filepath.Join(javaSourceDir, req.MainClass+".java")
	if err := os.WriteFile(javaFilePath, []byte(req.JavaCode), 0644); err != nil {
		log.Printf("写入 Java 文件失败: %v", err)
		http.Error(w, "无法写入 Java 源文件", http.StatusInternalServerError)
		return
	}

	mavenCmd := MavenCommand
	mavenHome := filepath.Join(ProgramDir, "resources", "maven")

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" && strings.HasSuffix(mavenCmd, ".cmd") {
		cmd = exec.Command("cmd", "/c", mavenCmd, "clean", "package", "-DskipTests", "-q")
	} else {
		cmd = exec.Command(mavenCmd, "clean", "package", "-DskipTests", "-q")
	}
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(), "MAVEN_HOME="+mavenHome)

	output, err := cmd.CombinedOutput()
	if err != nil {
		decodedOutput := decodeGBK(output)
		log.Printf("Maven 编译失败: %v, 输出: %s", err, decodedOutput)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Maven 编译失败: %v\n%s", err, decodedOutput),
		})
		return
	}

	targetDir := filepath.Join(projectDir, "target")
	jarFiles, err := filepath.Glob(filepath.Join(targetDir, "*.jar"))
	if err != nil || len(jarFiles) == 0 {
		log.Printf("未找到编译后的 JAR 文件，Glob 错误: %v，文件列表: %v", err, jarFiles)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "编译成功但未找到 JAR 文件",
		})
		return
	}

	// 优先选择不含 sources/original 后缀的主 JAR
	jarPath := jarFiles[0]
	for _, f := range jarFiles {
		base := filepath.Base(f)
		if !strings.Contains(base, "sources") && !strings.Contains(base, "original") {
			jarPath = f
			break
		}
	}
	log.Printf("找到 JAR 文件: %s", jarPath)

	jarData, readErr := os.ReadFile(jarPath)
	if readErr != nil {
		log.Printf("读取 JAR 文件失败: %v", readErr)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "读取 JAR 文件失败"})
		return
	}

	// 发送完成后异步清理构建目录，释放磁盘空间
	defer func() {
		go func() {
			if rmErr := os.RemoveAll(projectDir); rmErr != nil {
				log.Printf("清理构建目录失败: %v", rmErr)
			}
		}()
	}()

	w.Header().Set("Content-Disposition", `attachment; filename="`+req.PluginName+`.jar"`)
	w.Header().Set("Content-Type", "application/java-archive")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(jarData)))
	w.WriteHeader(http.StatusOK)
	w.Write(jarData)
	log.Printf("JAR 文件已发送: %s (%d bytes)", jarPath, len(jarData))
}

func getPom(req BuildRequest) string {
	groupId := req.GroupId
	if groupId == "" {
		groupId = req.PackageName
	}
	artifactId := req.ArtifactId
	if artifactId == "" {
		artifactId = strings.ToLower(req.PluginName)
	}
	return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>` + groupId + `</groupId>
    <artifactId>` + artifactId + `</artifactId>
    <version>` + req.Version + `</version>
    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.spigotmc</groupId>
            <artifactId>spigot-api</artifactId>
            <version>1.20.1-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
    <repositories>
        <repository>
            <id>spigot-repo</id>
            <url>https://hub.spigotmc.org/nexus/content/repositories/snapshots/</url>
        </repository>
    </repositories>
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-jar-plugin</artifactId>
                <version>3.3.0</version>
                <configuration>
                    <archive>
                        <manifestEntries>
                            <Main-Class>` + req.PackageName + `.` + req.MainClass + `</Main-Class>
                        </manifestEntries>
                    </archive>
                    <finalName>` + req.PluginName + `</finalName>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`
}

func getPluginYml(req BuildRequest) string {
	return `name: ` + req.PluginName + `
version: ` + req.Version + `
main: ` + req.PackageName + `.` + req.MainClass + `
author: ` + req.Author + `
website: ` + req.Website + `
api-version: 1.20`
}

func writeFile(path, content string) {
	os.WriteFile(path, []byte(content), 0644)
}
