package com.mytv.launcher;

import android.content.Context;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Small file-backed diagnostic logger for Android 7 receivers. Logs are kept
 * outside the read-only APK in app-specific storage and are capped to prevent
 * diagnostic data from consuming the receiver's limited disk or RAM.
 */
public final class ErrorLogger {
    private static final String TAG = "MyTVLauncher";
    private static final String DIRECTORY_NAME = "logs";
    private static final String LOG_FILE_NAME = "launcher-errors.log";
    private static final String PREVIOUS_LOG_FILE_NAME = "launcher-errors-previous.log";
    private static final long MAX_LOG_BYTES = 512L * 1024L;
    private static final Object LOCK = new Object();
    private static Context applicationContext;

    private ErrorLogger() {}

    public static void initialize(Context context) {
        applicationContext = context.getApplicationContext();
        log("INFO", "Application", "Diagnostic logging started", null);
    }

    public static void info(String source, String message) {
        log("INFO", source, message, null);
    }

    public static void warning(String source, String message) {
        log("WARN", source, message, null);
    }

    public static void error(String source, String message, Throwable throwable) {
        log("ERROR", source, message, throwable);
    }

    public static void fatal(String source, Throwable throwable) {
        log("FATAL", source, "Uncaught exception", throwable);
    }

    public static void log(String level, String source, String message, Throwable throwable) {
        Context context = applicationContext;
        String safeSource = sanitize(source, 120);
        String safeMessage = sanitize(message, 4_000);
        String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
        StringBuilder entry = new StringBuilder();
        entry.append(timestamp).append(" [").append(level).append("] ")
             .append(safeSource).append(": ").append(safeMessage).append('\n');
        if (throwable != null) entry.append(stackTrace(throwable)).append('\n');

        if ("ERROR".equals(level) || "FATAL".equals(level)) {
            Log.e(TAG, safeSource + ": " + safeMessage, throwable);
        } else if ("WARN".equals(level)) {
            Log.w(TAG, safeSource + ": " + safeMessage);
        } else {
            Log.i(TAG, safeSource + ": " + safeMessage);
        }

        if (context == null) return;
        synchronized (LOCK) {
            try {
                File logFile = getLogFile(context);
                rotateIfNeeded(logFile, entry.length());
                FileOutputStream output = new FileOutputStream(logFile, true);
                output.write(entry.toString().getBytes("UTF-8"));
                output.flush();
                output.close();
            } catch (Exception ignored) {
                // Avoid recursive failures if storage itself is unavailable.
            }
        }
    }

    public static String getLogPath(Context context) {
        return getLogFile(context).getAbsolutePath();
    }

    public static boolean clear(Context context) {
        synchronized (LOCK) {
            try {
                File directory = getLogDirectory(context);
                File current = new File(directory, LOG_FILE_NAME);
                File previous = new File(directory, PREVIOUS_LOG_FILE_NAME);
                boolean currentDeleted = !current.exists() || current.delete();
                boolean previousDeleted = !previous.exists() || previous.delete();
                info("ErrorLogger", "Diagnostic logs cleared");
                return currentDeleted && previousDeleted;
            } catch (Exception e) {
                error("ErrorLogger.clear", "Could not clear diagnostic logs", e);
                return false;
            }
        }
    }

    /** Copies the log to Downloads on Android 7 for easy collection by a file manager. */
    public static String exportToDownloads(Context context) {
        synchronized (LOCK) {
            try {
                File source = getLogFile(context);
                if (!source.exists() || source.length() == 0) {
                    info("ErrorLogger.export", "No diagnostic errors to export");
                    return "";
                }
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.exists() && !downloads.mkdirs()) {
                    warning("ErrorLogger.export", "Downloads directory is unavailable");
                    return "";
                }
                String time = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
                File destination = new File(downloads, "MyTVLauncher-errors-" + time + ".log");
                copy(source, destination);
                MediaScannerConnection.scanFile(context, new String[]{destination.getAbsolutePath()}, new String[]{"text/plain"}, null);
                info("ErrorLogger.export", "Diagnostic log exported: " + destination.getAbsolutePath());
                return destination.getAbsolutePath();
            } catch (Exception e) {
                error("ErrorLogger.export", "Could not export diagnostic log", e);
                return "";
            }
        }
    }

    private static File getLogDirectory(Context context) {
        File root = context.getExternalFilesDir(null);
        if (root == null) root = context.getFilesDir();
        File directory = new File(root, DIRECTORY_NAME);
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private static File getLogFile(Context context) {
        return new File(getLogDirectory(context), LOG_FILE_NAME);
    }

    private static void rotateIfNeeded(File file, int newEntryLength) {
        if (!file.exists() || file.length() + newEntryLength <= MAX_LOG_BYTES) return;
        File previous = new File(file.getParentFile(), PREVIOUS_LOG_FILE_NAME);
        if (previous.exists()) previous.delete();
        file.renameTo(previous);
    }

    private static void copy(File source, File destination) throws IOException {
        BufferedInputStream input = new BufferedInputStream(new FileInputStream(source));
        FileOutputStream output = new FileOutputStream(destination);
        byte[] buffer = new byte[8 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        output.flush();
        output.close();
        input.close();
    }

    private static String stackTrace(Throwable throwable) {
        StringWriter writer = new StringWriter();
        throwable.printStackTrace(new PrintWriter(writer));
        return writer.toString();
    }

    private static String sanitize(String value, int limit) {
        if (value == null) return "";
        String clean = value.replace('\u0000', ' ').trim();
        return clean.length() > limit ? clean.substring(0, limit) + "…" : clean;
    }
}
