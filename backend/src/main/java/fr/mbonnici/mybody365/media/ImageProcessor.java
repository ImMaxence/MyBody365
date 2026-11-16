package fr.mbonnici.mybody365.media;

import fr.mbonnici.mybody365.common.ApiException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Every uploaded picture is decoded and drawn again: what is stored is a fresh, resized WebP (JPEG if
 * cwebp is missing) with no metadata at all. Nothing of the original file survives, not even the GPS
 * position a phone may have written in it.
 */
@Component
public class ImageProcessor {

    private static final Logger log = LoggerFactory.getLogger(ImageProcessor.class);

    /** decompression bombs: a 20 MB file can claim billions of pixels */
    static final long MAX_PIXELS = 60_000_000L;
    static final int MIN_SIDE = 32;

    public record Processed(byte[] full, byte[] thumb, int width, int height, String format) {
        public String contentType() {
            return "webp".equals(format) ? "image/webp" : "image/jpeg";
        }
    }

    private final boolean webp;

    public ImageProcessor() {
        // the JDK only finds the plugins of the application class loader once told to look
        ImageIO.scanForPlugins();
        ImageIO.setUseCache(false);
        this.webp = cwebpAvailable();
        log.info("Pictures are stored as {}", webp ? "WebP (cwebp)" : "JPEG (cwebp not found)");
    }

    public boolean webp() {
        return webp;
    }

    /**
     * @param maxSide longest side of the stored picture
     * @param thumbSide longest side of the thumbnail
     */
    public Processed process(byte[] input, int maxSide, int thumbSide) {
        sniff(input);
        BufferedImage source = decode(input);
        BufferedImage full = scale(source, maxSide);
        BufferedImage thumb = scale(full, thumbSide);
        return new Processed(encode(full, 82), encode(thumb, 74), full.getWidth(), full.getHeight(), webp ? "webp" : "jpeg");
    }

    /** a square picture (profile pictures): the centre of the image, at most side × side, a single file */
    public Processed square(byte[] input, int side) {
        sniff(input);
        BufferedImage source = decode(input);
        int s = Math.min(source.getWidth(), source.getHeight());
        BufferedImage crop = source.getSubimage((source.getWidth() - s) / 2, (source.getHeight() - s) / 2, s, s);
        BufferedImage out = scale(crop, side);
        byte[] bytes = encode(out, 82);
        return new Processed(bytes, bytes, out.getWidth(), out.getHeight(), webp ? "webp" : "jpeg");
    }

    /** JPEG, PNG and WebP only: what browsers produce. HEIC is converted by the app before upload. */
    static void sniff(byte[] b) {
        if (b == null || b.length < 16) {
            throw ApiException.badRequest("invalid_image");
        }
        boolean jpeg = (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff;
        boolean png = (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        boolean webp = b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B'
                && b[11] == 'P';
        if (!jpeg && !png && !webp) {
            throw ApiException.badRequest("unsupported_image");
        }
    }

    static BufferedImage decode(byte[] bytes) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw ApiException.badRequest("unsupported_image");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if (w < MIN_SIDE || h < MIN_SIDE) {
                    throw ApiException.badRequest("invalid_image");
                }
                if ((long) w * h > MAX_PIXELS) {
                    throw ApiException.badRequest("image_too_large");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) {
                throw api;
            }
            throw ApiException.badRequest("invalid_image");
        }
    }

    /** halves the picture while it is twice too big, then one last bicubic step: sharp, without aliasing */
    static BufferedImage scale(BufferedImage src, int maxSide) {
        int w = src.getWidth();
        int h = src.getHeight();
        double f = Math.min(1.0, (double) maxSide / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * f));
        int th = Math.max(1, (int) Math.round(h * f));
        BufferedImage cur = rgb(src);
        while (cur.getWidth() / 2 >= tw && cur.getHeight() / 2 >= th) {
            cur = draw(cur, cur.getWidth() / 2, cur.getHeight() / 2);
        }
        if (cur.getWidth() != tw || cur.getHeight() != th) {
            cur = draw(cur, tw, th);
        }
        return cur;
    }

    /** opaque RGB, transparency over white */
    private static BufferedImage rgb(BufferedImage src) {
        if (src.getType() == BufferedImage.TYPE_INT_RGB) {
            return src;
        }
        return draw(src, src.getWidth(), src.getHeight());
    }

    private static BufferedImage draw(BufferedImage src, int w, int h) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private byte[] encode(BufferedImage img, int quality) {
        if (webp) {
            try {
                return cwebp(img, quality);
            } catch (IOException | RuntimeException e) {
                log.warn("cwebp failed, storing a JPEG instead: {}", e.getMessage());
            }
        }
        return jpeg(img, quality / 100f + 0.03f);
    }

    /** the picture goes to cwebp as a raw PPM (no decoder involved), with every metadata dropped */
    private static byte[] cwebp(BufferedImage img, int quality) throws IOException {
        Path in = Files.createTempFile("mb365-", ".ppm");
        Path out = Files.createTempFile("mb365-", ".webp");
        try {
            try (OutputStream os = Files.newOutputStream(in)) {
                writePpm(img, os);
            }
            Process p = new ProcessBuilder("cwebp", "-quiet", "-q", Integer.toString(quality), "-m", "4", "-metadata", "none",
                    "-o", out.toString(), "--", in.toString())
                    .redirectErrorStream(true)
                    .start();
            p.getInputStream().transferTo(OutputStream.nullOutputStream());
            if (!p.waitFor(60, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException("cwebp timed out");
            }
            if (p.exitValue() != 0) {
                throw new IOException("cwebp exit " + p.exitValue());
            }
            return Files.readAllBytes(out);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        } finally {
            Files.deleteIfExists(in);
            Files.deleteIfExists(out);
        }
    }

    static void writePpm(BufferedImage img, OutputStream os) throws IOException {
        int w = img.getWidth();
        int h = img.getHeight();
        os.write(("P6\n" + w + " " + h + "\n255\n").getBytes(StandardCharsets.US_ASCII));
        int[] row = new int[w];
        byte[] buf = new byte[w * 3];
        for (int y = 0; y < h; y++) {
            img.getRGB(0, y, w, 1, row, 0, w);
            for (int x = 0; x < w; x++) {
                int c = row[x];
                buf[x * 3] = (byte) (c >> 16);
                buf[x * 3 + 1] = (byte) (c >> 8);
                buf[x * 3 + 2] = (byte) c;
            }
            os.write(buf);
        }
    }

    static byte[] jpeg(BufferedImage img, float quality) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream out = new MemoryCacheImageOutputStream(bos)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(Math.min(1f, quality));
            writer.write(null, new IIOImage(img, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } finally {
            writer.dispose();
        }
        return bos.toByteArray();
    }

    private static boolean cwebpAvailable() {
        try {
            Process p = new ProcessBuilder("cwebp", "-version").redirectErrorStream(true).start();
            p.getInputStream().transferTo(OutputStream.nullOutputStream());
            return p.waitFor(10, TimeUnit.SECONDS) && p.exitValue() == 0;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
