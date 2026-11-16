package fr.mbonnici.mybody365;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class MyBody365Application {

    public static void main(String[] args) {
        SpringApplication.run(MyBody365Application.class, args);
    }
}
