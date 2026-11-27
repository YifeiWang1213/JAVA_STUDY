#!/bin/bash
PID=$(lsof -ti :4000 -sTCP:LISTEN)
if [ -n "$PID" ]; then
  kill $PID
  echo "博客已停止"
else
  echo "博客没有在运行"
fi
