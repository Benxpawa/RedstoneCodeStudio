package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"golang.org/x/text/encoding/simplifiedchinese"
)

var (
	// 编译信号量：限制同时进行的 Maven 构建数量
	buildSem     = make(chan struct{}, 1)
	ProgramDir   string
	MavenCommand string
)

var TempBuildDir string

// 持久化用户配置
var SettingsFile string

// AppSettings 应用持久化设置
type AppSettings struct {
	OnlineMode bool   `json:"onlineMode"`
	SessionEnc string `json:"sessionEnc,omitempty"`
	SessionIV  string `json:"sessionIv,omitempty"`
}

type StoredSession struct {
	Token string          `json:"token"`
	User  json.RawMessage `json:"user"`
	Exp   int64           `json:"exp"`
}

const _srvSecret = "rcs-srv-session-key-v1"

const (
	_apiOrigin = "https://api.zeromi.cn"
	_authPath  = "/api/market/auth"
)

var _trustedOrigins = []string{
	_apiOrigin,
}

func buildProxyTargetURL(path string) (string, error) {
	var targetURL string
	switch {
	case strings.HasPrefix(path, "http"):
		targetURL = path
	case strings.HasPrefix(path, "/"):
		targetURL = _apiOrigin + path
	default:
		targetURL = _apiOrigin + _authPath + "/" + path
	}

	u, err := url.Parse(targetURL)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("目标 URL 无效: %s", targetURL)
	}

	host := strings.ToLower(u.Hostname())
	for _, origin := range _trustedOrigins {
		ou, err := url.Parse(origin)
		if err != nil || ou.Host == "" {
			continue
		}
		if strings.ToLower(ou.Hostname()) == host && u.Scheme == ou.Scheme {
			return targetURL, nil
		}
	}
	return "", fmt.Errorf("目标域名不在白名单中: %s", targetURL)
}

type ProxyAuthRequest struct {
	Path    string                 `json:"path"`
	Payload map[string]interface{} `json:"payload"`
}

// 处理 POST /api/proxy/auth
func proxyAuthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req ProxyAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Path == "" {
		http.Error(w, `{"error":"path is required"}`, http.StatusBadRequest)
		return
	}

	targetURL, err := buildProxyTargetURL(req.Path)
	if err != nil {
		log.Printf("[proxy] 目标 URL 不受信任: %v", err)
		http.Error(w, `{"error":"untrusted target domain"}`, http.StatusForbidden)
		return
	}

	if req.Payload == nil {
		req.Payload = make(map[string]interface{})
	}
	req.Payload["_ts"] = time.Now().UnixMilli()

	body, err := json.Marshal(req.Payload)
	if err != nil {
		http.Error(w, `{"error":"marshal failed"}`, http.StatusInternalServerError)
		return
	}

	proxyReq, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		http.Error(w, `{"error":"create upstream request failed"}`, http.StatusInternalServerError)
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	if auth := r.Header.Get("Authorization"); auth != "" {
		proxyReq.Header.Set("Authorization", auth)
	}
	if xauth := r.Header.Get("X-Auth-Token"); xauth != "" {
		proxyReq.Header.Set("X-Auth-Token", xauth)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("[proxy] 上游请求失败: %v", err)
		http.Error(w, `{"error":"upstream request failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, `{"error":"read upstream response failed"}`, http.StatusBadGateway)
		return
	}
	w.WriteHeader(resp.StatusCode)
	w.Write(respBytes)
}

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
	SettingsFile = filepath.Join(ProgramDir, "settings.json")
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
	PluginName    string `json:"pluginName"`
	PackageName   string `json:"packageName"`
	MainClass     string `json:"mainClass"`
	FullMain      string `json:"fullMain"`
	Version       string `json:"version"`
	Author        string `json:"author"`
	Website       string `json:"website"`
	GroupId       string `json:"groupId"`
	ArtifactId    string `json:"artifactId"`
	ApiVersion    string `json:"apiVersion"`    // e.g. "1.21"
	SpigotVersion string `json:"spigotVersion"` // e.g. "1.21.4-R0.1-SNAPSHOT"
	JavaVersion   string `json:"javaVersion"`   // e.g. "21"
	JavaCode      string `json:"javaCode"`
	PluginYaml    string `json:"pluginYml"`
	ConfigYaml    string `json:"configYml"`
	PomXml        string `json:"pomXml"`
}

func configHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]string{
		"apiOrigin": _apiOrigin,
	})
}

func remotePassthroughHandler(remotePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		client := &http.Client{Timeout: 8 * time.Second}
		targetURL := _apiOrigin + remotePath

		resp, err := client.Get(targetURL)
		if err != nil {
			// 网络不通时返回空对象，前端静默忽略
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("{}"))
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("{}"))
			return
		}
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
	}
}

func main() {
	os.MkdirAll(TempBuildDir, 0755)

	port := getFreePort()
	addr := fmt.Sprintf(":%d", port)
	url := fmt.Sprintf("http://localhost:%d", port)

	http.Handle("/", http.FileServer(http.Dir(filepath.Join(ProgramDir, "resources"))))
	http.HandleFunc("/api/build", buildHandler)
	http.HandleFunc("/api/config", configHandler)
	http.HandleFunc("/api/settings", settingsHandler)
	http.HandleFunc("/api/session", sessionHandler)
	http.HandleFunc("/api/proxy/auth", proxyAuthHandler)
	http.HandleFunc("/api/update", remotePassthroughHandler("/api/update.php"))
	http.HandleFunc("/api/announce", remotePassthroughHandler("/api/announce.php"))

	go func() {
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Fatal(err)
		}
	}()

	waitForServer(url)

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

func deriveMachineKey() []byte {
	hostname, _ := os.Hostname()
	mac := hmac.New(sha256.New, []byte(_srvSecret))
	mac.Write([]byte("machine-session-key:"))
	mac.Write([]byte(hostname))
	return mac.Sum(nil)
}
func encryptSession(plaintext []byte) (ivB64, cipherB64 string, err error) {
	block, err := aes.NewCipher(deriveMachineKey())
	if err != nil {
		return "", "", fmt.Errorf("创建 AES 块失败: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", fmt.Errorf("创建 GCM 失败: %w", err)
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, iv); err != nil {
		return "", "", fmt.Errorf("生成 IV 失败: %w", err)
	}
	ciphertext := gcm.Seal(nil, iv, plaintext, nil)
	return base64.StdEncoding.EncodeToString(iv),
		base64.StdEncoding.EncodeToString(ciphertext), nil
}
func decryptSession(ivB64, cipherB64 string) ([]byte, error) {
	iv, err := base64.StdEncoding.DecodeString(ivB64)
	if err != nil {
		return nil, fmt.Errorf("IV 解码失败: %w", err)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(cipherB64)
	if err != nil {
		return nil, fmt.Errorf("密文解码失败: %w", err)
	}
	block, err := aes.NewCipher(deriveMachineKey())
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, iv, ciphertext, nil)
}
func sessionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {

	case http.MethodGet:
		s := loadSettings()
		if s.SessionEnc == "" || s.SessionIV == "" {
			http.Error(w, `{"error":"no session"}`, http.StatusNotFound)
			return
		}
		plain, err := decryptSession(s.SessionIV, s.SessionEnc)
		if err != nil {
			log.Printf("会话解密失败（可能是换了电脑或文件损坏）: %v", err)
			s.SessionEnc = ""
			s.SessionIV = ""
			saveSettings(s)
			http.Error(w, `{"error":"decrypt failed"}`, http.StatusNotFound)
			return
		}
		var sess StoredSession
		if err := json.Unmarshal(plain, &sess); err != nil {
			http.Error(w, `{"error":"invalid session data"}`, http.StatusNotFound)
			return
		}
		if sess.Exp > 0 && time.Now().UnixMilli() > sess.Exp {
			log.Printf("会话已过期，清除存储")
			s.SessionEnc = ""
			s.SessionIV = ""
			saveSettings(s)
			http.Error(w, `{"error":"session expired"}`, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token": sess.Token,
			"user":  sess.User,
			"exp":   sess.Exp,
		})

	case http.MethodPost:
		var sess StoredSession
		if err := json.NewDecoder(r.Body).Decode(&sess); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}
		if sess.Token == "" {
			http.Error(w, `{"error":"token is required"}`, http.StatusBadRequest)
			return
		}
		plain, err := json.Marshal(sess)
		if err != nil {
			http.Error(w, `{"error":"marshal failed"}`, http.StatusInternalServerError)
			return
		}
		ivB64, encB64, err := encryptSession(plain)
		if err != nil {
			log.Printf("会话加密失败: %v", err)
			http.Error(w, `{"error":"encrypt failed"}`, http.StatusInternalServerError)
			return
		}
		s := loadSettings()
		s.SessionEnc = encB64
		s.SessionIV = ivB64
		if err := saveSettings(s); err != nil {
			log.Printf("会话保存失败: %v", err)
			http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("会话已加密保存（TTL 至 %s）", time.UnixMilli(sess.Exp).Format(time.RFC3339))
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case http.MethodDelete:
		s := loadSettings()
		s.SessionEnc = ""
		s.SessionIV = ""
		if err := saveSettings(s); err != nil {
			log.Printf("清除会话失败: %v", err)
			http.Error(w, `{"error":"clear failed"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("会话已清除")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func loadSettings() AppSettings {
	data, err := os.ReadFile(SettingsFile)
	if err != nil {
		return AppSettings{OnlineMode: true}
	}
	var s AppSettings
	if err := json.Unmarshal(data, &s); err != nil {
		return AppSettings{OnlineMode: true}
	}
	return s
}

func saveSettings(s AppSettings) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(SettingsFile, data, 0600)
}

func settingsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	switch r.Method {
	case http.MethodGet:
		s := loadSettings()
		json.NewEncoder(w).Encode(s)

	case http.MethodPost:
		var s AppSettings
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}
		if err := saveSettings(s); err != nil {
			log.Printf("保存设置失败: %v", err)
			http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
			return
		}
		log.Printf("设置已保存: onlineMode=%v", s.OnlineMode)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
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

	// 构建整体超时（前端 90s 超时，后端多留余量主动终止进程）
	buildCtx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()

	// 获取编译信号量：可排队，客户端断开或超时则放弃，避免长期阻塞
	select {
	case buildSem <- struct{}{}:
		defer func() { <-buildSem }()
	case <-buildCtx.Done():
		log.Printf("编译等待被取消或超时: %v", buildCtx.Err())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "编译队列繁忙，请稍后重试"})
		return
	}

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
		cmd = exec.CommandContext(buildCtx, "cmd", "/c", mavenCmd, "clean", "package", "-DskipTests", "-q")
	} else {
		cmd = exec.CommandContext(buildCtx, mavenCmd, "clean", "package", "-DskipTests", "-q")
	}
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(), "MAVEN_HOME="+mavenHome)

	// Windows 下 cmd /c 会派生子进程，需连同整个进程树一起结束
	if runtime.GOOS == "windows" {
		cmd.Cancel = func() error {
			if cmd.Process == nil {
				return nil
			}
			taskkill := exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid))
			return taskkill.Run()
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		switch {
		case buildCtx.Err() == context.DeadlineExceeded:
			log.Printf("Maven 编译超时，已终止进程")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusGatewayTimeout)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "编译超时，已终止构建进程，请稍后重试",
			})
			return
		case buildCtx.Err() == context.Canceled:
			log.Printf("客户端断开，编译已取消")
			return
		}
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
	spigotVer := req.SpigotVersion
	if spigotVer == "" {
		spigotVer = "1.21.4-R0.1-SNAPSHOT"
	}
	javaVer := req.JavaVersion
	if javaVer == "" {
		javaVer = "21"
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
        <maven.compiler.source>` + javaVer + `</maven.compiler.source>
        <maven.compiler.target>` + javaVer + `</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.spigotmc</groupId>
            <artifactId>spigot-api</artifactId>
            <version>` + spigotVer + `</version>
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
	apiVer := req.ApiVersion
	if apiVer == "" {
		apiVer = "1.21"
	}
	return `name: ` + req.PluginName + `
version: ` + req.Version + `
main: ` + req.PackageName + `.` + req.MainClass + `
author: ` + req.Author + `
website: ` + req.Website + `
api-version: ` + apiVer
}

func writeFile(path, content string) {
	os.WriteFile(path, []byte(content), 0644)
}
