# Instalação do Maven

A imagem do sandbox já vem com Maven, JDK e Docker CLI configurados. Use os passos abaixo apenas se precisar habilitar o Maven na sua máquina local para rodar comandos do backend (ex.: `mvn test`).

## Passo a passo

1. Atualize o índice de pacotes:

   ```bash
   sudo apt-get update
   ```

2. Instale o Maven (o pacote já puxa o `openjdk-21-jre-headless` como dependência):

   ```bash
   sudo apt-get install -y maven
   ```

3. Valide a instalação conferindo a versão do Maven e do Java:

   ```bash
   mvn -version
   ```

O comando acima deve exibir a versão do Maven (3.8.x) e do Java (OpenJDK 21). Caso prefira uma versão diferente do Java, configure `JAVA_HOME` antes de executar o Maven.
