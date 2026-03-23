# generate config file and 
from rich import prompt
from rich.console import RenderResult
from rich.prompt import Prompt
from rich import print
from rich.panel import Panel
import json, os, sys
def generate_config():
	config: dict = {
 		"server_url": Prompt.ask("输入面板URL，可以带端口号:示例:[bold yellow]https://monitor.example.com:12345"),
  		"token": Prompt.ask("输入Token，示例:[bold yellow]deadbeefdeadbeefdeadbeefdeadbeef"),
   		"interval_seconds": int(Prompt.ask("按秒计算的更新时间",default="5")),
    	"heartbeat_seconds": int(Prompt.ask("按秒计算的心跳时间",default="60")),
    	"idle_threshold_seconds": int(Prompt.ask("按秒计算的AFK阈值时间",default="60"))
	}
	if Prompt.ask("保存吗？[y/n]", default="n") != "y":
		sys.exit(0)
	cfp = open("config.json","w")
	json.dump(config,cfp)
	cfp.flush()
	cfp.close()

if __name__ == "__main__":
	print(Panel.fit("[bold grey]视监面板一键构建脚本", border_style="blue"))
	if os.path.exists("config.json"):
		print("[bold green]找到了配置文件")
	else: generate_config()
	if Prompt.ask("开始构建吗？[y/n]", default="n") != "y":
		sys.exit(0)
	os.system("python -m nuitka --standalone --lto=yes --onefile --follow-imports --include-data-files=config.json=config.json main.py --include-windows-runtime-dlls=no")
