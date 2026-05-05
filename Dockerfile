FROM python:3.11.7

RUN apt update && apt upgrade -y && \
    apt install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /SuhaniBots

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip --root-user-action=ignore && \
    pip install --no-cache-dir -r requirements.txt --root-user-action=ignore

COPY . .
CMD ["python3", "bot.py"]



## vps deploy commands 

# python3 -m venv venv
# source venv/bin/activate
# pip install -r requirements.txt
# python3 bot.py
