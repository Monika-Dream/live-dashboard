package com.monika.dashboard.lsposed;

import android.content.Intent;
import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import io.github.libxposed.api.XposedInterface;
import io.github.libxposed.api.XposedModule;
import io.github.libxposed.api.XposedModuleInterface;

public final class MonikaXposedModule extends XposedModule {
    private static final String TAG = "MonikaLSP";
    private static final String TARGET_PACKAGE = "com.monika.dashboard";
    private static final String ACTION_STATUS = "com.monika.dashboard.LSPOSED_STATUS";

    @Override
    public void onSystemServerStarting(@NonNull XposedModuleInterface.SystemServerStartingParam param) {
        ClassLoader cl = param.getClassLoader();
        installHooks(cl, "com.android.server.wm.ActivityTaskSupervisor",
                "resumeTopActivity", "setResumedActivity");
        installHooks(cl, "com.android.server.wm.RootWindowContainer",
                "resumeFocusedTasksTopActivities", "ensureActivitiesVisible");
        installHooks(cl, "com.android.server.wm.WindowManagerService",
                "updateFocusedWindow", "setFocusedApp");
        installHooks(cl, "com.android.server.media.MediaSessionService",
                "onSessionPlaystateChanged", "updateMediaButtonSession");
    }

    private void installHooks(ClassLoader cl, String className, String... nameHints) {
        try {
            Class<?> clazz = Class.forName(className, false, cl);
            for (Method method : clazz.getDeclaredMethods()) {
                if (!matches(method.getName(), nameHints)) continue;
                hook(method)
                        .setExceptionMode(XposedInterface.ExceptionMode.PROTECTIVE)
                        .intercept(chain -> {
                            Object result = chain.proceed();
                            broadcastSnapshot(chain.getThisObject());
                            return result;
                        });
                log(Log.INFO, TAG, "hooked " + className + "#" + method.getName());
            }
        } catch (Throwable t) {
            log(Log.WARN, TAG, "skip " + className + ": " + t.getClass().getSimpleName());
        }
    }

    private boolean matches(String name, String[] hints) {
        for (String hint : hints) {
            if (name.contains(hint)) return true;
        }
        return false;
    }

    private void broadcastSnapshot(Object owner) {
        try {
            Intent intent = new Intent(ACTION_STATUS);
            intent.setPackage(TARGET_PACKAGE);
            intent.putExtra("package_name", findPackageName(owner));
            intent.putExtra("activity", findActivityName(owner));
            intent.putExtra("input_active", false);
            intent.putExtra("media_playing", false);
            Context context = getSystemContext();
            if (context != null) context.sendBroadcast(intent);
        } catch (Throwable t) {
            log(Log.WARN, TAG, "broadcast failed: " + t.getClass().getSimpleName());
        }
    }

    private String findPackageName(Object owner) {
        String text = findInterestingObject(owner);
        if (text == null) return null;
        int slash = text.indexOf('/');
        if (slash <= 0) return null;
        String before = text.substring(0, slash);
        int space = before.lastIndexOf(' ');
        return (space >= 0 ? before.substring(space + 1) : before).trim();
    }

    private String findActivityName(Object owner) {
        String text = findInterestingObject(owner);
        if (text == null) return null;
        int slash = text.indexOf('/');
        if (slash < 0 || slash + 1 >= text.length()) return null;
        return text.substring(slash + 1).split("[ }]", 2)[0];
    }

    private String findInterestingObject(Object owner) {
        if (owner == null) return null;
        String direct = owner.toString();
        if (direct.contains("/")) return direct;
        for (Field field : owner.getClass().getDeclaredFields()) {
            String name = field.getName().toLowerCase();
            if (!name.contains("resumed") && !name.contains("focus") && !name.contains("top")) {
                continue;
            }
            try {
                field.setAccessible(true);
                Object value = field.get(owner);
                if (value != null && value.toString().contains("/")) return value.toString();
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    private Context getSystemContext() {
        try {
            Class<?> activityThread = Class.forName("android.app.ActivityThread");
            Method current = activityThread.getDeclaredMethod("currentActivityThread");
            Object thread = current.invoke(null);
            if (thread == null) return null;
            Method getSystemContext = activityThread.getDeclaredMethod("getSystemContext");
            return (Context) getSystemContext.invoke(thread);
        } catch (Throwable ignored) {
            return null;
        }
    }
}
