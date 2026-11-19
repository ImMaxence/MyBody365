package fr.mbonnici.mybody365;

import java.time.Duration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

    static final String S3_KEY = "test-key";
    static final String S3_SECRET = "test-secret";

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:18.7-alpine"));
    }

    /** the same SeaweedFS as in the Compose files, with its S3 gateway and one identity */
    @Bean
    GenericContainer<?> seaweedfsContainer() {
        String config = "{\"identities\":[{\"name\":\"app\",\"credentials\":[{\"accessKey\":\"" + S3_KEY + "\",\"secretKey\":\""
                + S3_SECRET + "\"}],\"actions\":[\"Admin\",\"Read\",\"Write\",\"List\",\"Tagging\"]}]}";
        return new GenericContainer<>(DockerImageName.parse("chrislusf/seaweedfs:4.54"))
                .withCreateContainerCmdModifier(cmd -> cmd.withEntrypoint("/bin/sh", "-c"))
                // one argument: the whole script goes to sh -c (the String overload would split it on spaces)
                .withCommand(new String[] {"mkdir -p /tmp/data && echo '" + config + "' > /tmp/s3.json && exec weed server"
                        + " -dir=/tmp/data -ip.bind=0.0.0.0 -s3 -s3.config=/tmp/s3.json -master.volumeSizeLimitMB=64"})
                .withExposedPorts(8333)
                .waitingFor(Wait.forHttp("/").forPort(8333).forStatusCodeMatching(c -> c > 0 && c < 500)
                        .withStartupTimeout(Duration.ofMinutes(2)));
    }

    /** notifications stay in the tests: no request to Google, Apple or Mozilla */
    @Bean
    @Primary
    RecordingPushTransport recordingPushTransport() {
        return new RecordingPushTransport();
    }

    /** recipe sites stay in the tests too */
    @Bean
    @Primary
    CannedPages cannedPages() {
        return new CannedPages();
    }

    @Bean
    DynamicPropertyRegistrar storageProperties(GenericContainer<?> seaweedfsContainer) {
        return registry -> {
            registry.add("app.storage.endpoint",
                    () -> "http://" + seaweedfsContainer.getHost() + ":" + seaweedfsContainer.getMappedPort(8333));
            registry.add("app.storage.access-key", () -> S3_KEY);
            registry.add("app.storage.secret-key", () -> S3_SECRET);
            // Open Food Facts and the Ciqual repository, faked locally
            String fake = FakeOpenData.start();
            registry.add("app.nutrition.off-url", () -> fake);
            registry.add("app.nutrition.off-search-url", () -> fake);
            registry.add("app.nutrition.ciqual-dataset-url", () -> fake + "/ciqual/dataset");
            registry.add("app.nutrition.off-dump-url", () -> fake + "/off/export.csv.gz");
        };
    }
}
